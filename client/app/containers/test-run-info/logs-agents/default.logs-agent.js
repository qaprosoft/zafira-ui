'use strict';

const defaultLogsAgent = function defaultLogsAgent(
    $httpMock,
    authService,
    moment,
) {
    'ngInject';

    const fileExtensionPattern = /(\.[0-9a-z]+)(?:[\?#]|$)/i;

    return {
        name: 'Default logs agent',
        esIndex: '',
        prefix: 'test-run-data-',
        searchCriteria: [],

        initESIndex,
        initSearchCriteria,
        handleScreenshotLog,
    };

    function handleScreenshotLog(log) {
        log.level = 'INFO';
        log.urls = {};

        if (log.message) {
            log.originalMessage = log.message;
            log.message = 'Screenshot is captured';

            let relativeImageUrl = log.originalMessage
                .replace(new RegExp(`^(${log.tenant || authService.tenant})`, 'i'), '');

            if (relativeImageUrl.length !== log.originalMessage.length || relativeImageUrl.charAt(0) !== '/') {
                relativeImageUrl = `/${relativeImageUrl}`;
            }

            if (relativeImageUrl) {
                const imageUrl = `${$httpMock.apiHost}${relativeImageUrl}`;
                const thumbnailUrl = imageUrl.replace(fileExtensionPattern, '_thumbnail$1');

                log.urls.image = { path: imageUrl, name: 'screenshot' };
                log.urls.thumb = { path: thumbnailUrl };
            }
        }

        return log;
    }

    function initSearchCriteria(testRunId, testId) {
        this.searchCriteria = [
            { testRunId },
            { testId },
        ];
    }

    function initESIndex(startTime, finishTime) {
        const startTimeFormatted = moment.utc(startTime).format('YYYY.MM.DD');
        const finishTimeFormatted = moment.utc(finishTime).format('YYYY.MM.DD');
        const startIndex = `${this.prefix}${startTimeFormatted}`;
        const finishIndex = `${this.prefix}${finishTimeFormatted}`;

        this.esIndex = startIndex === finishIndex ? startIndex : `${startIndex},${finishIndex}`;
    }
}
export default defaultLogsAgent;
