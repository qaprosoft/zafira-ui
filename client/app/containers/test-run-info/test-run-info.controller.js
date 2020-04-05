'use strict';

import ImagesViewerController from '../../components/modals/images-viewer/images-viewer.controller';

const testRunInfoController = function testRunInfoController(
    $scope,
    $mdDialog,
    $interval,
    $filter,
    $anchorScroll,
    $location,
    $timeout,
    $q,
    elasticsearchService,
    UtilService,
    ArtifactService,
    $stateParams,
    OFFSET,
    API_URL,
    $state,
    TestRunsStorage,
    testsRunsService,
    TestService,
    $transitions,
    pageTitleService,
    authService,
) {
    'ngInject';

    const mobileWidth = 480;
    const vm = {
        testRun: null,
        configSnapshot: null,
        wsSubscription: null,
        switchMoreLess,
        getFullLogMessage,
        downloadImageArtifacts,
        downloadAllArtifacts,
        get hasVideo() { return hasVideo(); },
        get currentTitle() { return pageTitleService.pageTitle; },
    };

    vm.$onInit = controllerInit;

    $scope.test = {};
    $scope.drivers = [];
    let logSizeCount = 0;
    var driversQueue = [];
    var driversCount = 0;
    $scope.elasticsearchDataLoaded = false;
    $scope.selectedDriver = 0;
    $scope.OFFSET = OFFSET;
    $scope.MODE = {};
    $scope.tab = { title: 'History', content: "Tabs will become paginated if there isn't enough room for them." };
    $scope.TestRunsStorage = TestRunsStorage;

    $scope.goToTestRuns = function () {
        $state.go('tests.runDetails', {
            testRunId: vm.testRun.id,
            configSnapshot: vm.configSnapshot,
        });
    };

    var from = 0;

    var page = 1;
    var size = 5;

    var LIVE_DEMO_ARTIFACT_NAME = 'live video';
    var SEARCH_CRITERIA = '';
    var ELASTICSEARCH_INDEX = '';
    var UTC = 'UTC';

    var MODES = {
        live: {
            name: 'live',
            element: '.testrun-info__tab-video-wrapper',
            initFunc: initLiveMode,
            logGetter: {
                from: 0,
                pageCount: null,
                getSizeFunc: function (count) {
                    return count - MODES.live.logGetter.from;
                },
                accessFunc: function (count) {
                    return count > MODES.live.logGetter.from;
                }
            }

        },
        record: {
            name: 'record',
            element: 'video',
            initFunc: initRecordMode,
            logGetter: {
                from: null,
                pageCount: page,
                getSizeFunc: function (count) {
                    return count;
                },
                accessFunc: null
            }
        }
    };

    var LIVE_LOGS_INTERVAL_NAME = 'liveLogsFromElasticsearch';
    var scrollEnable = true;

    function downloadImageArtifacts() {
        ArtifactService.extractImageArtifacts([$scope.test]);

        ArtifactService.downloadArtifacts({
            data: [$scope.test],
            field: 'imageArtifacts',
        });
    }

    function downloadAllArtifacts() {
        ArtifactService.downloadArtifacts({
            data: [$scope.test],
            field: 'artifactsToDownload',
        });
    }

    function postModeConstruct(test) {
        var logGetter = MODES[$scope.MODE.name].logGetter;
        switch ($scope.MODE.name) {
            case 'live':
                provideVideo();
                $scope.logs = [];
                tryToGetLogsLiveFromElasticsearch(logGetter, LIVE_LOGS_INTERVAL_NAME);
                break;
            case 'record':
                $scope.selectedDriver = 0;
                initRecords(test);
                closeAll();

                $scope.logs = [];
                logSizeCount = 0;
                unrecognizedImages = {};
                scrollEnable = false;
                tryToGetLogsHistoryFromElasticsearch(logGetter)
                    .then(() => {
                        // 10 attempts provide a 5-minute max interval
                        const attemptsToLoadImages = 10;
                        let imagesLoadingAttempts = 0;
                        let delay = 5000;
                        const maxDelay = 40000;

                        $timeout(() => {
                            logGetter.pageCount = null;
                            logGetter.from = $scope.logs.length + logSizeCount;
                            function update() {
                                $timeout(function() {
                                    if (Object.size(unrecognizedImages) > 0 && imagesLoadingAttempts < attemptsToLoadImages) {
                                        logGetter.from = $scope.logs.length + logSizeCount;
                                        tryToGetLogsHistoryFromElasticsearch(logGetter);
                                        update();
                                        imagesLoadingAttempts += 1;
                                        // increase delay to next call up to maxDelay
                                        delay = delay < maxDelay ? delay + delay : maxDelay;
                                    }
                                }, delay, false);
                            }
                            tryToGetLogsHistoryFromElasticsearch(logGetter)
                                .then(() => {
                                    update();
                                });
                        }, delay);
                });
                break;
            default:
                break;
        }
    };

    function setMode(modeName) {
        if ($scope.MODE != modeName) {
            $scope.drivers = [];
            $scope.MODE = MODES[modeName];
        }
    };

    function getLogsFromElasticsearch(from, page, size) {
        return $q(resolve => {
            elasticsearchService.search(ELASTICSEARCH_INDEX, SEARCH_CRITERIA, from, page, size, $scope.test.startTime)
                .then(rs => resolve(rs.map(r => r._source)));
        });
    }

    function tryToGetLogsHistoryFromElasticsearch(logGetter) {
        return $q(resolve => {
            elasticsearchService.count(ELASTICSEARCH_INDEX, SEARCH_CRITERIA, $scope.test.startTime)
                .then(count => {
                    if (logGetter.accessFunc ? logGetter.accessFunc.call(this, count) : true) {
                        const size = logGetter.getSizeFunc.call(this, count);

                        collectElasticsearchLogs(logGetter.from, logGetter.pageCount, size, count, resolve);
                    }
                });
        });
    };

    function tryToGetLogsLiveFromElasticsearch(logGetter, logIntervalName) {
        return $q(function (resolve, reject) {
            pseudoLiveDoAction(logIntervalName, 5000, function () {
                getLogsLiveFromElasticsearch(logGetter);
            });
        });
    };

    function getLogsLiveFromElasticsearch(logGetter) {
        tryToGetLogsHistoryFromElasticsearch(logGetter).then(function (count) {
            MODES.live.logGetter.from = count;
        });
    };

    var liveIntervals = {};

    function pseudoLiveDoAction(intervalName, intervalMillis, func) {
        func.call();
        liveIntervals[intervalName] = $interval(function() {func.call()}, intervalMillis);
    };

    function pseudoLiveCloseAction(intervalName) {
        $interval.cancel(liveIntervals[intervalName]);
    }

    function switchMoreLess(e, log) {
        const rowElem = e.target.closest('.testrun-info__tab-table-col._action');
        const scrollableElem = rowElem.closest('.testrun-info__tab-table-wrapper');

        log.showMore = !log.showMore;
        if (!log.showMore) {
            $timeout(function () {
                if (scrollableElem.scrollTop > rowElem.offsetTop) {
                    scrollableElem.scrollTop = rowElem.offsetTop;
                }
            }, 0);
        }
    }

    function getFullLogMessage(log) {
        return log.message.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/ *(\r?\n|\r)/g, '<br/>').replace(/\s/g, '&nbsp;');
    }

    function collectElasticsearchLogs(from, page, size, count, resolveFunc) {
        getLogsFromElasticsearch(from, page, size)
            .then(hits => {
                hits.forEach(hit => followUpOnLogs(hit));
                prepareArtifacts();
                if (!from && from !== 0 && (page * size < count)) {
                    page++;
                    collectElasticsearchLogs(from, page, size, count, resolveFunc);
                } else {
                    $scope.elasticsearchDataLoaded = true;
                    resolveFunc.call(this, count);
                    if (scrollEnable && $location.hash()) {
                        $anchorScroll();
                    }
                }
            });
    }

    function initRecords(test) {
        var videoArtifacts = getArtifactsByPartName(test, 'video', 'live');
        if (videoArtifacts && videoArtifacts.length) {
            $scope.drivers = $scope.drivers.concat(videoArtifacts.filter(function (value) {
                return $scope.drivers.indexOfField('name', value.name) == -1;
            }));
            var link = $scope.drivers && $scope.drivers.length ? $scope.drivers[0].link : '';
            watchUntilPainted('#videoRecord:has(source[src = \'' + link + '\'])', reloadVideo);
        }
    };

    $scope.videoMode = { mode: "UNKNOWN" };
    var track;

    function reloadVideo(e) {
        var videoElements = angular.element(e);
        reloadVideoOnError(videoElements[0]);
        if (videoElements && videoElements.length) {
            videoElements[0].addEventListener("loadedmetadata", onMetadataLoaded, false);
            videoElements[0].addEventListener('loadeddata', onDataLoaded, false);
            videoElements[0].addEventListener('timeupdate', onTimeUpdate, false);
            videoElements[0].addEventListener('webkitfullscreenchange', onFullScreenChange, false);
            videoElements[0].addEventListener('mozfullscreenchange', onFullScreenChange, false);
            videoElements[0].addEventListener('fullscreenchange', onFullScreenChange, false);
            videoElements[0].addEventListener('ratechange', onRateChange, false);

            videoElements[0].addEventListener('playing', function() {
                $scope.$apply(function () {
                    $scope.videoMode.mode = "PLAYING";
                });
            }, false);
            videoElements[0].addEventListener('play', function() {
                $scope.$apply(function () {
                    $scope.videoMode.mode = "PLAYING";
                });
            }, false);
            videoElements[0].addEventListener('pause', function() {
                $scope.$apply(function () {
                    $scope.videoMode.mode = "PAUSE";
                });
            }, false);
            videoElements[0].addEventListener('loadstart', function() {
            }, false);
        }
        loadVideo(videoElements[0], 200);
    };

    function hasVideo() {
        const currentDriver = $scope.drivers[$scope.selectedDriver];

        return currentDriver && currentDriver.link;
    };

    function reloadVideoOnError(videoElement) {
        var sourceElement = videoElement.getElementsByTagName('source')[0];
        var attempt = new Date().getTime() - $scope.test.finishTime > 600000 ? 1 : 5;

        sourceElement.addEventListener('error', function(e) {
            if (attempt > 0) {
                loadVideo(videoElement, 5000);
            }
            attempt--;
        }, false);
    };

    function onMetadataLoaded(ev) {
        track = this.addTextTrack("captions", "English", "en");
        track.mode = 'hidden';
    };

    function onTimeUpdate(ev) {
        var activeTrack = track && track.activeCues && track.activeCues.length ? track.activeCues[0] : null;
        $scope.currentTime = ev.target.currentTime;
        if (activeTrack) {
            $scope.$apply(function () {
                $scope.currentLog = { id: activeTrack.id, message: activeTrack.text };
            });
        }
    };

    function onDataLoaded(ev) {
        $scope.$apply(function () {
            $scope.videoMode.mode = "LOADED";
        });
        var videoElement = ev.target;
        var elasticsearchDataWatcher = $scope.$watch('elasticsearchDataLoaded', function (isLoaded) {
            if (isLoaded) {
                var videoDuration = videoElement.duration;
                var errorTime = getLogsStartErrorTime(videoDuration, $scope.logs);
                $scope.logs.forEach(function (log, index) {
                    var currentLogTime = log.timestamp - $scope.logs[0].timestamp + errorTime;
                    log.videoTimestamp = currentLogTime / 1000;
                });
                addSubtitles(track, videoDuration);
                elasticsearchDataWatcher();
            }
        });
    };

    function onFullScreenChange(ev) {
        track.mode = track.mode == 'showing' ? 'hidden' : 'showing';
    };

    function onRateChange(ev) {
    };

    function addSubtitles(track, videoDuration) {
        if (track && !track.cues.length) {
            $scope.logs.forEach(function (log, index) {
                var finishTime = index != $scope.logs.length - 1 ? $scope.logs[index + 1].videoTimestamp : videoDuration;
                var vttCue = new VTTCue(log.videoTimestamp, finishTime, log.message);
                vttCue.id = index;
                track.addCue(vttCue);
            });
        }
    };

    function getLogsStartErrorTime(duration, logs) {
        let logsDuration = 0;

        if (logs.length) {
            logsDuration = logs[logs.length - 1].timestamp - logs[0].timestamp;
        }

        return duration * 1000 - logsDuration;
    }

    function loadVideo(videoElement, timeout) {
        $timeout(function () {
            videoElement.load();
        }, timeout);
    };

    $scope.getVideoState = function (log) {
        $timeout(() => {
            const videoElement = angular.element('#videoRecord')[0];

            videoElement && log.videoTimestamp && (videoElement.currentTime = log.videoTimestamp);
        }, 0);
    };

    function getArtifactsByPartName(test, partName, exclusion) {
        return test.artifacts ? test.artifacts.filter(function (artifact) {
            return artifact.name.toLowerCase().includes(partName) && !artifact.name.toLowerCase().includes(exclusion);
        }) : [];
    };

    function addDrivers(artifacts) {
        artifacts.sort(compareByCreatedAt);
        artifacts.forEach(function (artifact) {
            addDriver(artifact);
        });
    };

    function addDriver(liveDemoArtifact) {
        if (liveDemoArtifact && $scope.drivers.indexOfField('name', liveDemoArtifact.name) == -1) {
            $scope.drivers.push(liveDemoArtifact);
            liveDemoArtifact.index = $scope.drivers.length - 1;
            driversQueue.push(liveDemoArtifact);
        }
    };

    $scope.selectedLogRow = -1;

    $scope.selectLogRow = function(ev, index) {
        var hash = ev.currentTarget.parentNode.attributes.id.value;
        $location.hash(hash);
    };

    $scope.copyLogLine = function(log) {
        var message = $filter('date')(new Date(log.timestamp), 'HH:mm:ss') + ' [' + log.threadName + '] ' + '[' + log.level + '] ' + log.message;
        message.copyToClipboard();
    };

    $scope.copyLogPermalink = function() {
        $location.$$absUrl.copyToClipboard();
    };

    $scope.$watch(function () {
        return $location.hash()
    }, function (newVal, oldVal) {
        var selectedLogRowClass = 'selected-log-row';
        if (newVal && oldVal) {
            if (newVal == oldVal) {
                watchUntilPainted('#' + newVal, function () {
                    angular.element('#' + newVal).addClass(selectedLogRowClass);
                });
            } else {
                angular.element('#' + newVal).addClass(selectedLogRowClass);
                angular.element('#' + oldVal).removeClass(selectedLogRowClass);
            }
            $scope.selectedLogRow = newVal.split('log-')[1];
        }
    });

    $scope.fullScreen = function(minimizeOnly) {
        var fullScreenClass = 'full-screen';
        var vncContainer = angular.element(MODES.live.element)[0];
        var hideArray = ['.testrun-info__tab-table-wrapper', '.testrun-info__tab-additional'];
        if (vncContainer.classList.contains(fullScreenClass)) {
            vncContainer.classList.remove(fullScreenClass);
            hideArray.forEach(function (value) {
                angular.element(value)[0].style.display = 'block';
            });
            $scope.onResize();
        } else if (!minimizeOnly) {
            vncContainer.classList.add(fullScreenClass);
            hideArray.forEach(function (value) {
                angular.element(value)[0].style.display = 'none';
            });
            $scope.onResize();
        }
    };

    $scope.switchDriver = function (index) {
        if ($scope.selectedDriver != index) {
            $scope.selectedDriver = index;
            postDriverChanged();
        }
    };

    function postDriverChanged() {
        switch ($scope.MODE.name) {
            case 'live':
                closeRfbConnection();
                provideVideo();
                break;
            case 'record':
                initRecords($scope.test);
                break;
            default:
                break;
        }
    };

    var painterWatcher;

    function watchUntilPainted(elementLocator, func) {
        painterWatcher = $scope.$watch(function() { return angular.element(elementLocator).is(':visible') }, function(newVal) {
            if (newVal) {
                func.call(this, elementLocator);
                painterWatcher();
            }
        });
    };

    function compareByCreatedAt(a, b) {
        if (a.createdAt < b.createdAt)
            return -1;
        if (a.createdAt > b.createdAt)
            return 1;
        return 0;
    }

    function prepareArtifacts() {
        // extract image artifacts from logs
        const imageArtifacts = $scope.logs.reduce((formatted, artifact) => {
            if (artifact.isImageExists && artifact.blobLog.image && artifact.blobLog.image.path) {
                artifact.blobLog.image.path.forEach(path => {
                    if (path) {
                        const url = new URL(path);
                        let newArtifact = {
                            id: path,
                            name: artifact.blobLog.image.threadName,
                            link: path,
                            extension: url.pathname.split('/').pop().split('.').pop(),
                        };

                        if (artifact.blobLog.thumb && artifact.blobLog.thumb.path) {
                            newArtifact.thumb = artifact.blobLog.thumb.path;
                        }

                        formatted.push(newArtifact);
                    }
                });
            }

            return formatted;
        }, []);

        // extract artifacts from test
        const artifactsToDownload = $scope.test.artifacts.reduce((formatted, artifact) => {
            const name = artifact.name.toLowerCase();

            if (!name.includes('live') && !name.includes('video') && artifact.link) {
                const links = artifact.link.split(' ');
                let url = null;

                try {
                    url = new URL(links[0]);
                } catch (error) {
                    artifact.hasBrokenLink = true;
                    console.warn(`Artifact "${name}" has invalid link.`);
                }

                if (url instanceof URL) {
                    artifact.extension = url.pathname.split('/').pop().split('.').pop();
                }
                formatted.push(artifact);
            }

            return formatted;
        }, []);

        $scope.test.imageArtifacts = imageArtifacts;
        $scope.test.artifactsToDownload = [...artifactsToDownload, ...imageArtifacts];
    }

    $scope.openImagesViewerModal = function (event, url) {
        const activeArtifact = $scope.test.imageArtifacts.find(function (art) {
            return art.link === url;
        });

        if (activeArtifact) {
            $mdDialog.show({
                controller: ImagesViewerController,
                template: require('../../components/modals/images-viewer/images-viewer.html'),
                controllerAs: '$ctrl',
                bindToController: true,
                parent: angular.element(document.body),
                targetEvent: event,
                clickOutsideToClose: true,
                fullscreen: false,
                escapeToClose: false,
                locals: {
                    test: $scope.test,
                    activeArtifactId: activeArtifact.id,
                }
            });
        }
    };

    /**************** Websockets **************/
    var testsWebsocketName = 'tests';

    function initTestsWebSocket(testRun) {
        $scope.testsWebsocket = Stomp.over(new SockJS(API_URL + "/api/websockets"));
        $scope.testsWebsocket.debug = null;
        $scope.testsWebsocket.ws.close = function() {};
        $scope.testsWebsocket.connect({ withCredentials: false }, function () {
            if ($scope.testsWebsocket.connected) {
                vm.wsSubscription = $scope.testsWebsocket.subscribe("/topic/" + authService.tenant + ".testRuns." + testRun.id + ".tests", function (data) {
                    var test = $scope.getEventFromMessage(data.body).test;

                    if ($scope.test && test.id === $scope.test.id) {

                        if (test.status === 'IN_PROGRESS') {
                            addDrivers(getArtifactsByPartName(test, LIVE_DEMO_ARTIFACT_NAME));
                            driversCount = $scope.drivers.length;
                        } else {
                            pseudoLiveCloseAction(LIVE_LOGS_INTERVAL_NAME);
                            $scope.fullScreen(true);
                            setMode('record');
                            var videoArtifacts = getArtifactsByPartName(test, 'video', 'live') || [];
                            if (videoArtifacts.length === driversCount) {
                                addDrivers(videoArtifacts);
                                postModeConstruct(test);
                            }
                        }
                        $scope.test = angular.copy(test);
                        $scope.$apply();

                    }
                });
            }
        }, function () {
            UtilService.reconnectWebsocket(testsWebsocketName, initTestsWebSocket);
        });
        UtilService.websocketConnected(testsWebsocketName);
    };

    var rfb;
    var logsStompName;
    var logsStomp;

    function followUpOnLogs(log) {
        if ($scope.MODE.name === 'live' && driversQueue.length) {
            log.driver = driversQueue.pop();
            driversQueue = [];
        }
        collectLogs(log);
    }

    $scope.logs = [];
    var unrecognizedImages = {};

    function collectLogs(log) {
        switch (log.level) {
            case 'META_INFO':
                collectScreenshots(log);
                break;
            default:
                $scope.logs.push(log);
                break;
        }
        $scope.$applyAsync();
    };

    function collectScreenshots(log) {
        var correlationId = getMetaLogCorrelationId(log);
        var isThumbnail = isThumb(log);
        var existsUnrecognizedImage = getUnrecognizedImageExists(isThumbnail, correlationId);
        logSizeCount++;
        if (existsUnrecognizedImage) {
            catchScreenshot(log, existsUnrecognizedImage, correlationId, isThumbnail);
        } else {
            preScreenshot(log, correlationId, isThumbnail);
        }
    };

    function preScreenshot(log, correlationId, isThumbnail) {
        var index = $scope.logs.length - 1;
        var appenToLog = $scope.logs[index];
        appenToLog.blobLog = appenToLog.blobLog || {};
        if (isThumbnail) {
            appenToLog.blobLog.thumb = log;
        } else {
            appenToLog.blobLog.image = log;
        }
        appenToLog.isImageExists = false;
        unrecognizedImages[correlationId] = unrecognizedImages[correlationId] || {};
        if (isThumbnail) {
            unrecognizedImages[correlationId].thumb = { 'log': appenToLog, 'index': index };
        } else {
            unrecognizedImages[correlationId].image = { 'log': appenToLog, 'index': index };
        }
    };

    function catchScreenshot(log, preScreenshot, correlationId, isThumbnail) {
        var path;
        if (isThumbnail) {
            path = getMetaLogThumbAmazonPath(log);
            preScreenshot.log.blobLog.thumb.path = path;
            if (!unrecognizedImages[correlationId].image) {
                delete unrecognizedImages[correlationId];
            } else {
                delete unrecognizedImages[correlationId].thumb;
            }
        } else {
            path = getMetaLogAmazonPath(log);
            preScreenshot.log.blobLog.image.path = preScreenshot.log.blobLog.image.path || [];
            preScreenshot.log.blobLog.image.path.push(path);
            preScreenshot.log.isImageExists = true;
            if (!unrecognizedImages[correlationId].thumb) {
                delete unrecognizedImages[correlationId];
            } else {
                delete unrecognizedImages[correlationId].image;
            }
        }
    };

    function getUnrecognizedImageExists(isThumbnail, correlationId) {
        if (!unrecognizedImages[correlationId]) {
            return false;
        }
        return isThumbnail ? unrecognizedImages[correlationId].thumb : unrecognizedImages[correlationId].image;
    };

    function getMetaLogCorrelationId(log) {
        return getMetaLogHeader(log, 'AMAZON_PATH_CORRELATION_ID');
    };

    function getMetaLogAmazonPath(log) {
        return getMetaLogHeader(log, 'AMAZON_PATH');
    };

    function getMetaLogThumbAmazonPath(log) {
        return getMetaLogHeader(log, 'THUMB_AMAZON_PATH');
    };

    function getMetaLogHeader(log, headerName) {
        return log.headers[headerName];
    };

    function isThumb(log) {
        return getMetaLogThumbAmazonPath(log) !== undefined;
    };

    function provideVideo() {
        var driversWatcher = $scope.$watchCollection('drivers', function (newVal) {
            if (newVal && newVal.length) {
                var wsUrl = $scope.drivers[$scope.selectedDriver].link;
                watchUntilPainted('#vnc', function (e) {
                    rfb = ArtifactService.connectVnc(angular.element($scope.MODE.element)[0], 'offsetHeight', 'offsetWidth', wsUrl, vncDisconnected);
                });
                driversWatcher();
            }
        });
    };

    function vncDisconnected() {
    };

    $scope.getEventFromMessage = function (message) {
        return JSON.parse(message.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
    };

    $scope.onResize = function () {
        ArtifactService.resize(angular.element($scope.MODE.element)[0], rfb);
    };

    /**************** On destroy **************/
    function bindEvents() {
        $scope.$on('$destroy', function () {
            cancelIntervals();
            closeAll();
            vm.wsSubscription && vm.wsSubscription.unsubscribe();
            closeTestsWebsocket();
        });
        TestService.subscribeOnLocationChangeStart();

        const onTransStartSubscription = $transitions.onStart({}, function (trans) {
            const toState = trans.to();

            if (toState.name !== 'tests.runDetails') {
                TestService.clearDataCache();
                TestService.clearPreviousUrl();
                TestService.unsubscribeFromLocationChangeStart();
            }
            onTransStartSubscription();
        });
    }

    function cancelIntervals() {
        Object.keys(liveIntervals).forEach(name => {
            pseudoLiveCloseAction(name);
        });
    }

    function closeRfbConnection() {
        if (rfb && rfb._rfb_connection_state == 'connected') {
            rfb.disconnect();
        }
    };

    function closeTestsWebsocket() {
        if ($scope.testsWebsocket && $scope.testsWebsocket.connected) {
            $scope.$watch('testsWebsocket.hasClosePermission', function (newVal) {
                if (newVal) {
                    $timeout(function () {
                        $scope.testsWebsocket.disconnect();
                    });
                    UtilService.websocketConnected(testsWebsocketName);
                }
            });
        }
    };

    function closeAll() {
        closeRfbConnection();
        if (logsStomp && logsStomp.connected) {
            logsStomp.disconnect();
            UtilService.websocketConnected(logsStompName);
        }
    };

    /**************** Initialization **************/

    function initLiveMode(test) {
        var videoArtifacts = getArtifactsByPartName(test, LIVE_DEMO_ARTIFACT_NAME) || [];
        addDrivers(videoArtifacts);
        driversCount = $scope.drivers.length;
        postModeConstruct(test);
    };

    function initRecordMode(test) {
        var videoArtifacts = getArtifactsByPartName(test, 'video', 'live') || [];
        addDrivers(videoArtifacts);
        postModeConstruct(test);
    };

    function buildIndex() {
        var startTime = 'logs-' + $filter('date')($scope.test.startTime, 'yyyy.MM.dd', UTC);
        var finishTime = $scope.test.finishTime ? 'logs-' + $filter('date')($scope.test.finishTime, 'yyyy.MM.dd', UTC) : 'logs-' + $filter('date')(new Date().getTime(), 'yyyy.MM.dd', UTC);
        return startTime == finishTime ? startTime : startTime + ',' + finishTime;
    };

    function controllerInit() {
        initTestsWebSocket(vm.testRun);
        vm.testRun.normalizedPlatformData = testsRunsService.normalizeTestPlatformData(vm.testRun.config);

        const params = {
            'page': 1,
            'pageSize': 100000,
            'testRunId': vm.testRun.id
        };

        TestService.searchTests(params)
            .then(function (rs) {
                if (rs.success) {
                    const data = rs.data.results || [];
                    vm.testRun.tests = {};
                    TestService.tests = data;
                    setTestParams();
                    pageTitleService.setTitle(window.innerWidth <= mobileWidth ? 'Test details' : $scope.test.name);
                } else {
                    console.error(rs.message);
                }
            })
            .finally(() => {
                bindEvents();
            });
    }

    function setTestParams() {
        const testId = parseInt($stateParams.testId, 10);

        $scope.test = TestService.getTest(testId);
        if ($scope.test) {
            SEARCH_CRITERIA = { 'correlation-id': vm.testRun.ciRunId + '_' + $scope.test.ciTestId };
            ELASTICSEARCH_INDEX = buildIndex();

            setMode($scope.test.status === 'IN_PROGRESS' ? 'live' : 'record');
            $scope.MODE.initFunc.call(this, $scope.test);
        }
    }

    return vm;
};

export default testRunInfoController;
