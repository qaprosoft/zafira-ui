'use strict';

const toolsService = function toolsService($httpMock, $q, UtilService) {
    'ngInject';

    let loader$ = null;
    let tools = {

    };
    const service = {
        initialized: false,

        get tools() { return tools; },
        getTools,
        getNotificationToolConnection,
        fetchToolSettings,
        updateSettings,
        fetchToolConnectionStatus,
        uploadSettingFile,
        fetchIntegrationsTypes,
        fetchIntegrationOfType,
        fetchIntegrationOfTypeByName,
        createIntegration,

        // fillToolSettings,
        setToolStatus,
        isToolConnected,
        isEmptyTool
    };

    function getTools(force) {
        if (!force && loader$) {
            return loader$;
        }

        loader$ = fetchTools();

        return loader$;
    }

    function setToolStatus(toolName, id, status) {
        let currentTool = tools[toolName].find((tool) => {
            return tool.integrationId === id;
        })
        if (currentTool.connected === status) { return; }

        currentTool.connected = status;
    }

    function isToolConnected(currentTool) {
        if(!currentTool.name) {
            return tools[currentTool] && tools[currentTool].some((tool) => {
                return tool.connected;
            });
        } else if(tools[currentTool.type.name]) {
            let tempTool = tools[currentTool.type.name].find((tool) => {
                return tool.integrationId === currentTool.id;
            })

            return tempTool && tempTool.connected;
        }
    }

    function isEmptyTool(tool) {
        return !tool.settings.find((setting) => {
            return setting.value;
        })
    }

    function updateSettings(id, integrationDTO) {
        return $httpMock.put(`${$httpMock.apiHost}${$httpMock.reportingPath}/api/integrations/${id}`, integrationDTO)
            .then(UtilService.handleSuccess, UtilService.handleError('Unable to edit settings'));
    }

    /* Fetch available tools with their statuses */
    function fetchTools() {
        return $httpMock.get(`${$httpMock.apiHost}${$httpMock.reportingPath}/api/integrations-info`)
            .then(UtilService.handleSuccess, UtilService.handleError('Unable to fetch tools'))
            .then(response => {
                if (response.success) {
                    tools = formatTools(response.data);

                    return tools;
                }

                return $q.reject(response);
            });
    }

    function formatTools(toolsForFormatting) {
        let formattedTools = {};
        for (let key in toolsForFormatting) {
            formattedTools = {...formattedTools, ...toolsForFormatting[key]};
        }

        return formattedTools;
    }

    function getNotificationToolConnection() {
        return fetchIntegrationOfTypeByName('NOTIFICATION_SERVICE')
            .then(response => {
                if (response.success) {
                    const data = response.data || [];

                    return data.some(tool => tool.connected);
                }

                return false;
            });
    }

    function fetchToolSettings(toolName) {
        return $httpMock.get(`${$httpMock.apiHost}${$httpMock.reportingPath}/api/settings/tool/${toolName}`)
            .then(UtilService.handleSuccess, UtilService.handleError(`Unable to fetch ${toolName} settings`));
    }

    function fetchIntegrationsTypes() {
        return $httpMock.get(`${$httpMock.apiHost}${$httpMock.reportingPath}/api/integration-groups`)
            .then(UtilService.handleSuccess, UtilService.handleError(`Unable to fetch integration groups`));
    }

    function createIntegration(integrationTypeId, integrationDTO) {
        return $httpMock.post(`${$httpMock.apiHost}${$httpMock.reportingPath}/api/integrations?integrationTypeId=${integrationTypeId}`, integrationDTO)
            .then(UtilService.handleSuccess, UtilService.handleError('Unable to create integration'));
    }

    function fetchIntegrationOfType(type) {
        return $httpMock.get(`${$httpMock.apiHost}${$httpMock.reportingPath}/api/integrations?groupId=${type}`)
            .then(UtilService.handleSuccess, UtilService.handleError(`Unable to fetch integrations of groups`));
    }

    function fetchIntegrationOfTypeByName(name) {
        return $httpMock.get(`${$httpMock.apiHost}${$httpMock.reportingPath}/api/integrations?groupName=${name}`)
            .then(UtilService.handleSuccess, UtilService.handleError(`Unable to fetch integrations of groups`));
    }

    function fetchToolConnectionStatus(groupName, id) {
        return $httpMock.get(`${$httpMock.apiHost}${$httpMock.reportingPath}/api/integrations-info/${id}?groupName=${groupName}`)
            .then(UtilService.handleSuccess, UtilService.handleError('Unable to get tool connection'));
    }

    function uploadSettingFile(multipartFile, tool, settingName) {
        const config = { headers: { 'Content-Type': undefined }, transformRequest : angular.identity };

        return $httpMock.post(`${$httpMock.apiHost}${$httpMock.reportingPath}/api/settings/tools?tool=${tool}&name=${settingName}&file=`, multipartFile, config)
            .then(UtilService.handleSuccess, UtilService.handleError('Unable to upload file'));
    }

    return service;
};

export default toolsService;
