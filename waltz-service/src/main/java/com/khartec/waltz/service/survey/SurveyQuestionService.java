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

package com.khartec.waltz.service.survey;


import com.khartec.waltz.data.survey.SurveyQuestionDao;
import com.khartec.waltz.model.survey.SurveyQuestion;
import com.khartec.waltz.service.survey.inclusion_evaluator.QuestionPredicateEvaluator;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.List;

import static org.finos.waltz.common.Checks.checkNotNull;
import static org.finos.waltz.common.Checks.checkTrue;

@Service
public class SurveyQuestionService {

    private final SurveyQuestionDao surveyQuestionDao;
    private final QuestionPredicateEvaluator evaluator;


    @Autowired
    public SurveyQuestionService(SurveyQuestionDao surveyQuestionDao,
                                 QuestionPredicateEvaluator evaluator) {
        checkNotNull(surveyQuestionDao, "surveyQuestionDao cannot be null");

        this.surveyQuestionDao = surveyQuestionDao;
        this.evaluator = evaluator;
    }


    public List<SurveyQuestion> findForSurveyTemplate(long templateId) {
        return surveyQuestionDao.findForTemplate(templateId);
    }


    public List<SurveyQuestion> findForSurveyRun(long surveyRunId) {
        return surveyQuestionDao.findForSurveyRun(surveyRunId);
    }


    public List<SurveyQuestion> findForSurveyInstance(long surveyInstanceId) {
        return evaluator.determineActiveQuestions(surveyInstanceId);
    }


    public long create(SurveyQuestion surveyQuestion) {
        checkNotNull(surveyQuestion, "surveyQuestion cannot be null");

        return surveyQuestionDao.create(surveyQuestion);
    }


    public int update(SurveyQuestion surveyQuestion) {
        checkNotNull(surveyQuestion, "surveyQuestion cannot be null");
        checkTrue(surveyQuestion.id().isPresent(), "question id cannot be null");

        return surveyQuestionDao.update(surveyQuestion);
    }


    public int delete(long questionId) {

        if(!surveyQuestionDao.hasResponses(questionId)){
            return surveyQuestionDao.delete(questionId);
        } else {
            throw new IllegalArgumentException("There are responses to this question so it cannot be deleted");
        }
    }
}
