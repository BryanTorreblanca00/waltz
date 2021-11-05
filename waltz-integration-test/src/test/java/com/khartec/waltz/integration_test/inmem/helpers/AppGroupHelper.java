package com.khartec.waltz.integration_test.inmem.helpers;

import org.finos.waltz.common.CollectionUtilities;
import org.finos.waltz.common.exception.InsufficientPrivelegeException;
import com.khartec.waltz.model.EntityReference;
import com.khartec.waltz.model.app_group.AppGroup;
import com.khartec.waltz.model.app_group.AppGroupKind;
import com.khartec.waltz.model.app_group.ImmutableAppGroup;
import com.khartec.waltz.service.app_group.AppGroupService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.Collection;
import java.util.Collections;

@Service
public class AppGroupHelper {

    @Autowired
    private AppGroupService appGroupService;

    public Long createAppGroupWithAppRefs(String groupName, Collection<EntityReference> appRefs) throws InsufficientPrivelegeException {
        Collection<Long> appIds = CollectionUtilities.map(appRefs, EntityReference::id);
        return createAppGroupWithAppIds(groupName, appIds);
    }


    public Long createAppGroupWithAppIds(String groupName, Collection<Long> appIds) throws InsufficientPrivelegeException {

        Long gId = appGroupService.createNewGroup("appGroupHelper");

        AppGroup g = ImmutableAppGroup
                .builder()
                .id(gId)
                .name(groupName)
                .appGroupKind(AppGroupKind.PUBLIC)
                .build();

        appGroupService.updateOverview("appGroupHelper", g);

        appGroupService.addApplications("appGroupHelper", gId, appIds, Collections.emptySet());

        return gId;
    }

}
