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

package com.khartec.waltz.web;

import org.finos.waltz.common.LoggingUtilities;
import org.finos.waltz.common.exception.DuplicateKeyException;
import org.finos.waltz.common.exception.InsufficientPrivelegeException;
import org.finos.waltz.common.exception.NotFoundException;
import org.finos.waltz.common.exception.UpdateFailedException;
import com.khartec.waltz.service.DIConfiguration;
import com.khartec.waltz.service.settings.SettingsService;
import com.khartec.waltz.web.endpoints.Endpoint;
import com.khartec.waltz.web.endpoints.api.StaticResourcesEndpoint;
import com.khartec.waltz.web.endpoints.extracts.DataExtractor;
import org.jooq.exception.DataAccessException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import spark.*;

import java.util.Map;
import java.util.TimeZone;

import static org.finos.waltz.common.DateTimeUtilities.UTC;
import static com.khartec.waltz.web.WebUtilities.reportException;
import static com.khartec.waltz.web.endpoints.EndpointUtilities.addExceptionHandler;
import static spark.Spark.*;

public class Main {

    private static final Logger LOG = LoggerFactory.getLogger(Main.class);
    private final static String GZIP_ENABLED_NAME = "server.gzip.enabled";
    private final static String GZIP_MIN_SIZE_NAME = "server.gzip.minimum-size";

    private static AnnotationConfigApplicationContext ctx;

    public static void main(String[] args) {
        new Main().go();
    }


    public static AnnotationConfigApplicationContext getSpringContext() {
        return ctx;
    }


    private void go() {
        TimeZone.setDefault(TimeZone.getTimeZone(UTC));
        startHttpServer();
    }


    private void startHttpServer() {
        String listenPortStr = System.getProperty("waltz.port", "8443");
        boolean sslEnabled = Boolean.valueOf(System.getProperty("waltz.ssl.enabled", "false"));

        String home = System.getProperty("user.home");

        System.out.println("\n" +
                "    :::       :::     :::     :::    ::::::::::: ::::::::: \n" +
                "    :+:       :+:   :+: :+:   :+:        :+:          :+:  \n" +
                "    +:+       +:+  +:+   +:+  +:+        +:+         +:+   \n" +
                "    +#+  +:+  +#+ +#++:++#++: +#+        +#+        +#+    \n" +
                "    +#+ +#+#+ +#+ +#+     +#+ +#+        +#+       +#+     \n" +
                "     #+#+# #+#+#  #+#     #+# #+#        #+#      #+#      \n" +
                "      ###   ###   ###     ### ########## ###     #########" +
                "\n\n ");

        System.out.println("--WALTZ---------------------------------------------");
        System.out.println("Home is: " + home);
        System.out.println("Listening on port: " + listenPortStr);
        System.out.println("SSL Enabled: " + sslEnabled);
        System.out.println("----------------------------------------------------");

        if (sslEnabled) {
            Spark.secure(home + "/.waltz/keystore.jks", "password", null, null);
        }

        int listenPort = Integer.parseInt(listenPortStr);
        port(listenPort);


        start();
    }

    void start() {
        // configure logging
        LoggingUtilities.configureLogging();

        ctx = new AnnotationConfigApplicationContext(DIConfiguration.class);

        Map<String, Endpoint> endpoints = ctx.getBeansOfType(Endpoint.class);
        endpoints.forEach((name, endpoint) -> {
            LOG.info("Registering Endpoint: {}", name);
            endpoint.register();
        });

        Map<String, DataExtractor> extractors = ctx.getBeansOfType(DataExtractor.class);
        extractors.forEach((name, extractor) -> {
            LOG.info("Registering Extractor: {}", name);
            extractor.register();
        });

        new StaticResourcesEndpoint().register();

        LOG.info("Completed endpoint registration");

        registerExceptionHandlers();
        enableGZIP();
        enableCORS();
    }


    private void registerExceptionHandlers() {

        addExceptionHandler(InsufficientPrivelegeException.class, (e, req, resp) ->
                reportException(403, "NOT_AUTHORIZED", e.getMessage(), resp, LOG));

        addExceptionHandler(NotFoundException.class, (e, req, res) -> {
            String message = "Not found exception" + e.getMessage();
            LOG.error(message);
            reportException(
                    404,
                    e.getCode(),
                    message,
                    res,
                    LOG);
        });

        addExceptionHandler(UpdateFailedException.class, (e, req, res) -> {
            String message = "Update failed exception:" + e.getMessage();
            LOG.error(message);
            reportException(
                    400,
                    e.getCode(),
                    message,
                    res,
                    LOG);
        });

        addExceptionHandler(DuplicateKeyException.class, (e, req, res) -> {
            String message = "Duplicate detected: " + e.getMessage();
            LOG.error(message);
            reportException(
                    500,
                    "DUPLICATE",
                    message,
                    res,
                    LOG);
        });

        addExceptionHandler(DataAccessException.class, (e, req, resp) -> {
            String message = "Exception: " + e.getCause().getMessage();
            LOG.error(message);
            reportException(
                    400,
                    e.sqlState(),
                    message,
                    resp,
                    LOG);
        });

        addExceptionHandler(IllegalArgumentException.class, (e, req, resp) -> {
            String message = "Illegal Argument Exception: " + e.getMessage();
            LOG.error(message);
            reportException(
                    400,
                    "ILLEGAL ARGUMENT",
                    message,
                    resp,
                    LOG);
        });

        addExceptionHandler(WebException.class, (e, req, res) -> {
            String message = "Web exception: " + e.getMessage();
            LOG.error(message);
            reportException(
                    500,
                    e.getCode(),
                    message,
                    res,
                    LOG);
        });

        addExceptionHandler(Exception.class, (e, req, res) -> {
            String message = "Generic Exception: " + e.getMessage() + " / " + e.getClass().getCanonicalName();
            LOG.error(message, e);
            reportException(
                    500,
                    "unknown",
                    message,
                    res,
                    LOG);
        });
    }


    private void enableGZIP() {
        SettingsService settingsService = ctx.getBean(SettingsService.class);

        Boolean gzipEnabled = settingsService
                .getValue(GZIP_ENABLED_NAME)
                .map(x -> x.equalsIgnoreCase("true"))
                .orElse(false);

        if(gzipEnabled) {

            //now fetch the minimum size
            int minimumLength = settingsService
                    .getValue(GZIP_MIN_SIZE_NAME)
                    .map(Integer::parseInt)
                    .orElse(8192);

            after(((request, response) -> {
                if(response.body() != null && response.body().length() >= minimumLength) {
                    response.header("Content-Encoding", "gzip");
                }
            }));

            LOG.info("Enabled GZIP (size: " + minimumLength + ")");

        } else {
            LOG.info("GZIP not enabled");
        }


    }

    private void enableCORS() {

        options("/*", (req, res) -> {
            handleCORSHeader(req, res, "Access-Control-Request-Headers", "Access-Control-Allow-Headers");
            handleCORSHeader(req, res, "Access-Control-Request-Method", "Access-Control-Allow-Methods");
            res.header("Access-Control-Max-Age", "600");
            return "OK";
        });

        before((req, res) -> res.header("Access-Control-Allow-Origin", "*"));
        before((req, res) -> res.header("Access-Control-Expose-Headers", "*"));
        LOG.info("Enabled CORS");
    }


    private void handleCORSHeader(Request req, Response res, String requestHeader, String responseHeader) {
        String accessControlRequestHeaders = req.headers(requestHeader);
        if (accessControlRequestHeaders != null) {
            res.header(responseHeader, accessControlRequestHeaders);
        }
    }

}
