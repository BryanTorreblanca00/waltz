/*
 * Waltz - Enterprise Architecture
 * Copyright (C) 2016, 2017, 2018, 2019 Waltz open source project
 * See README.md for more information
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific
 *
 */

import _ from "lodash";
import {CORE_API} from "../../../common/services/core-api-utils";
import {initialiseData} from "../../../common";
import {kindToViewState} from "../../../common/link-utils";
import {determineEditableCategories, loadAllData, mkTab} from "../../measurable-rating-utils";
import {mkRatingsKeyHandler} from "../../../ratings/rating-utils";

import template from "./measurable-rating-edit-panel.html";
import {displayError} from "../../../common/error-utils";
import {alignDateToUTC} from "../../../common/date-utils";
import toasts from "../../../svelte-stores/toast-store";

const bindings = {
    parentEntityRef: "<",
    startingCategoryId: "<?",
    plannedDecommissions: "<?",
    replacementApps: "<?",
    replacingDecommissions: "<?",
    application: "<"
};


const initialState = {
    activeTab: null,
    allocations: [],
    allocationSchemes: [],
    categories: [],
    measurables: [],
    plannedDecommissions: [],
    ratings: [],
    ratingSchemesById: {},
    ratingItemsBySchemeIdByCode: {},
    replacementApps: [],
    replacingDecommissions: [],
    saveInProgress: false,
    selected: null,
    startingCategoryId: null,
    tabs: [],
    unusedCategories: [],
    visibility: {
        ratingEditor: false,
        showDescriptionInPicker: false,
        instructions: true,
        schemeOverview: false,
        showAllCategories: false,
        tab: null,
        loading: false
    }
};


function controller($q,
                    $state,
                    serviceBroker,
                    userService) {
    const vm = initialiseData(this, initialState);

    const loadData = (force) => {
        return loadAllData($q, serviceBroker, vm.parentEntityRef, force)
            .then(r => Object.assign(vm, r))
            .then(() => {

                const editableCategories = _.filter(vm.categories, d => _.includes(vm.editableCategoryIds, d.category.id));

                // Need to filer on the empty categories here
                vm.tabs = vm.visibility.showAllCategories
                    ? editableCategories
                    : _.filter(editableCategories, d => d.ratingCount > 0);

                vm.categoriesById = _.keyBy(vm.categories, d => d.category.id);
                vm.hasHiddenTabs = editableCategories.length !== vm.tabs.length;

                const startingCat = _.find(vm.tabs, t => t.category.id === vm.startingCategoryId);

                const startingCategory = _.isEmpty(startingCat)
                    ? vm.tabs[0]
                    : startingCat;

                vm.visibility.tab = startingCategory.category.id;
                recalcTabs(startingCategory.category.id);

            })
    };

    const recalcTabs = function (categoryId) {
        return vm.reloadTabInfo(categoryId, true);
    };

    const deselectMeasurable = () => {
        vm.saveInProgress = false;
        vm.visibility = Object.assign({}, vm.visibility, {schemeOverview: true, ratingEditor: false});
    };

    const selectMeasurable = (node) => {
        const {measurable, allocations} = node;
        const category = vm.categoriesById[measurable.categoryId];
        const ratingScheme = vm.ratingSchemesById[category.ratingSchemeId];
        const hasWarnings = !_.isEmpty(allocations);

        vm.selected = Object.assign({}, node, {category, hasWarnings, ratingScheme});
        vm.visibility = Object.assign({}, vm.visibility, {schemeOverview: false, ratingEditor: true});
    };


    const getRating = () => _.get(vm.selected, ["rating", "rating"]);


    /**
     * Generic save function
     * @param method  the CORE_API method to invoke
     * @param param  the param
     * @returns {*}  promise
     */
    const doSave = (method, param) => {
        return serviceBroker
            .execute(
                method,
                [vm.parentEntityRef, vm.selected.measurable.id, param])
            .then((r) => {
                vm.ratings = r.data;
                recalcTabs(vm.selected.measurable.categoryId);
                vm.saveInProgress = false;
            });
    }

    const doRatingItemSave = (rating) => {
        return doSave(CORE_API.MeasurableRatingStore.saveRatingItem, rating)
            .then(() => {
                const newRating = _.merge({}, vm.selected.rating, {rating});
                vm.selected = Object.assign({}, vm.selected, {rating: newRating});
            });
    };

    const doRatingIsPrimarySave = (isPrimary) => {
        return doSave(CORE_API.MeasurableRatingStore.saveRatingIsPrimary, isPrimary)
            .then(() => {
                const newRating = _.merge({}, vm.selected.rating, {isPrimary})
                vm.selected = Object.assign({}, vm.selected, {rating: newRating});
            });
    };

    const doRatingDescriptionSave = (description) => {
        return doSave(CORE_API.MeasurableRatingStore.saveRatingDescription, description)
            .then(() => {
                const newRating = _.merge({}, vm.selected.rating, {description})
                vm.selected = Object.assign({}, vm.selected, {rating: newRating});
            });
    };

    const doRemove = () => {
        if (!vm.selected.rating) return $q.reject();

        vm.saveInProgress = true;

        return serviceBroker
            .execute(
                CORE_API.MeasurableRatingStore.remove,
                [vm.parentEntityRef, vm.selected.measurable.id])
            .then(r => {
                vm.saveInProgress = false;
                vm.ratings = r.data;
                vm.selected.rating = null;
                recalcTabs(vm.selected.measurable.categoryId);
            });
    };

    const reloadDecommData = () => {
        return vm.reloadTabInfo(vm.activeTab.category.id, true);
    };

    const saveDecommissionDate = (dateChange)  => {

        if(_.isNil(dateChange.newVal)){
            toasts.error("Could not save this decommission date. " +
                "Check the date entered is valid or to remove this decommission date use the 'Revoke' button below");
        } else {
            dateChange.newVal = alignDateToUTC(dateChange.newVal).toISOString();

            serviceBroker
                .execute(
                    CORE_API.MeasurableRatingPlannedDecommissionStore.save,
                    [vm.selected.rating.id, dateChange])
                .then(r => {
                    const decom = Object.assign(r.data, {isValid: true});
                    vm.selected = Object.assign({}, vm.selected, {decommission: decom});
                    toasts.success(`Saved decommission date for ${vm.selected.measurable.name}`);
                })
                .catch(e => displayError("Could not save decommission date", e))
                .finally(reloadDecommData);
        }
    };

    // -- BOOT --

    vm.$onInit = () => {

        const allCategoriesPromise = serviceBroker
            .loadViewData(CORE_API.MeasurableCategoryStore.findAll)
            .then(r => r.data);

        const permissionsPromise = serviceBroker
            .loadViewData(CORE_API.PermissionGroupStore.findForParentEntityRef, [vm.parentEntityRef])
            .then(r => r.data);

        const userRolesPromise = userService
            .whoami()
            .then(user => user.roles);

        $q.all([allCategoriesPromise, permissionsPromise, userRolesPromise])
            .then(([categories, permissions, userRoles]) =>{
                const editableCategories = determineEditableCategories(categories, permissions, userRoles);
                vm.editableCategoryIds = _.map(editableCategories, d => d.id);
            })
            .then(() => loadData())

        vm.backUrl = $state
            .href(
                kindToViewState(vm.parentEntityRef.kind),
                {id: vm.parentEntityRef.id});

        vm.allocationsByMeasurableId = _.groupBy(vm.allocations, a => a.measurableId);
        vm.allocationSchemesById = _.keyBy(vm.allocationSchemes, s => s.id);
    };


    // -- INTERACT ---

    vm.onRemoveReplacementApp = (replacement) => {
        return serviceBroker
            .execute(
                CORE_API.MeasurableRatingReplacementStore.remove,
                [replacement.decommissionId, replacement.id])
            .then(r => {
                vm.selected = Object.assign({}, vm.selected, { replacementApps: r.data });
                toasts.success("Replacement app removed")
            })
            .catch(e  => displayError("Could not remove replacement app", e))
            .finally(reloadDecommData);
    };

    vm.onSaveReplacementApp = (replacement) => {
        return serviceBroker
            .execute(
                CORE_API.MeasurableRatingReplacementStore.save,
                [replacement.decommissionId, replacement])
            .then(r => {
                vm.selected = Object.assign({}, vm.selected, { replacementApps: r.data });
                toasts.success("Successfully saved replacement app")
            })
            .catch(e  => displayError("Could not add replacement app", e))
            .finally(reloadDecommData);
    };

    vm.checkPlannedDecomDateIsValid = (decomDate) => {

        const appDate = new Date(vm.application.plannedRetirementDate);
        const newDecomDate = new Date(decomDate);

        const sameDate = appDate.getFullYear() === newDecomDate.getFullYear()
            && appDate.getMonth() === newDecomDate.getMonth()
            && appDate.getDate() === newDecomDate.getDate();

        return appDate > newDecomDate || sameDate;
    };

    vm.onSaveDecommissionDate = (dateChange) => {

        if (vm.application.entityLifecycleStatus === "REMOVED"){
            toasts.error("Decommission date cannot be set. This application is no longer active");
            return;
        }

        if (_.isNull(vm.application.plannedRetirementDate) || vm.checkPlannedDecomDateIsValid(dateChange.newVal)){
            saveDecommissionDate(dateChange);

        } else {
            const appDate = new Date(vm.application.plannedRetirementDate).toDateString();

            if (!confirm(`This decommission date is later then the planned retirement date of the application: ${appDate}. Are you sure you want to save it?`)){
                toasts.error("Decommission date was not saved");
                return;
            }
            saveDecommissionDate(dateChange)
        }
    };

    vm.onRemoveDecommission = () => {
        if (!confirm("Are you sure you want to remove this decommission and any replacement apps?")) {
            toasts.info("Revocation of decommission cancelled");
            return;
        }
        serviceBroker
            .execute(
                CORE_API.MeasurableRatingPlannedDecommissionStore.remove,
                [vm.selected.decommission.id])
            .then(() => {
                vm.selected = Object.assign({}, vm.selected, { decommission: null, replacementApps: [] });
                toasts.success(`Removed decommission date and replacement applications for: ${vm.selected.measurable.name}`);
            })
            .catch(e => displayError("Could not remove decommission date", e))
            .finally(reloadDecommData);
    };

    vm.onMeasurableSelect = (node) => {
        selectMeasurable(node);
    };

    vm.onRatingSelect = r => {
        if (! vm.selected.measurable) return; // nothing selected
        if (! vm.selected.measurable.concrete) return; // not concrete
        if (r === getRating()) return; // rating not changed

        return r === "X"
            ? doRemove()
                .then(() => {
                    toasts.success(`Removed: ${vm.selected.measurable.name}`)
                })
                .catch(e => {
                    vm.saveInProgress = false;
                    displayError("Could not remove measurable rating.", e);
                    deselectMeasurable();
                })
            : doRatingItemSave(r)
                .then(() => {
                    toasts.success(`Saved: ${vm.selected.measurable.name}`)
                })
                .catch(e => {
                    displayError("Could not save rating", e);
                    deselectMeasurable();
                    throw e;
                });
    };

    vm.onSaveComment = (comment) => {
        return doRatingDescriptionSave(comment)
            .then(() => toasts.success(`Saved Comment for: ${vm.selected.measurable.name}`))
            .catch(e => {
                displayError("Could not save comment for rating", e);
                throw e;
            })
    };

    vm.doCancel = () => {
        deselectMeasurable();
    };

    vm.onRemoveAll = (categoryId) => {
        if (confirm("Do you really want to remove all ratings in this category which are not read-only?")) {
            serviceBroker
                .execute(
                    CORE_API.MeasurableRatingStore.removeByCategory,
                    [vm.parentEntityRef, categoryId])
                .then(r => {
                    toasts.info("Removed all ratings for category which are not read-only");
                    vm.ratings = r.data;
                    recalcTabs(categoryId);
                })
                .catch(e => {
                    const message = "Error removing all ratings for category: " + e.message;
                    toasts.error(message);
                });
        }
    };

    vm.onPrimaryToggle = () => {
        doRatingIsPrimarySave(!vm.selected.rating.isPrimary)
            .then(() => toasts.success(`Saved primary indicator for: ${vm.selected.measurable.name}`))
            .catch(e => {
                deselectMeasurable();
                displayError("Could not save primary indicator", e);
                throw e;
            });
    };

    vm.onTabChange = (categoryId, force = false) => {
        deselectMeasurable();
        return vm.reloadTabInfo(categoryId, force)
    };

    vm.reloadTabInfo = (categoryId, force = false) => {
        vm.visibility.loading = true;
        return serviceBroker
            .loadViewData(
                CORE_API.MeasurableRatingStore.getViewForEntityAndCategory,
                [vm.parentEntityRef, categoryId],
                {force})
            .then(r => {
                const tab = r.data;
                vm.activeTab = mkTab(tab, true);

                vm.onKeypress = mkRatingsKeyHandler(
                    vm.activeTab.ratingSchemeItems,
                    vm.onRatingSelect,
                    vm.doCancel);
            })
            .then(() => vm.visibility.loading = false);
    };

    vm.onShowAllTabs = () => {
        vm.visibility.showAllCategories = true;
        loadData();
    };

}


controller.$inject = [
    "$q",
    "$state",
    "ServiceBroker",
    "UserService"
];


const component = {
    template,
    bindings,
    controller
};


export default {
    component,
    id: "waltzMeasurableRatingEditPanel"
};
