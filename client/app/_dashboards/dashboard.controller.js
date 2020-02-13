'use strict';

import widgetDialog from './widget-dialog/widget-dialog.html';
import widgetDialogController from './widget-dialog/widget-dialog.controller';
import dashboardEmailModalTemplate from './dashboard-email-modal/dashboard-email-modal.html';
import dashboardEmailModalController from './dashboard-email-modal/dashboard-email-modal.controller';
import widgetWizardController from './../components/modals/widget-wizard/widget-wizard.controller';
import widgetWizardModalTemplate from './../components/modals/widget-wizard/widget_wizard.html';
import dashboardSettingsModalController
    from "../shared/modals/dashboard-settings-modal/dashboard-settings-modal.controller";
import dashboardSettingsModalTemplate from "../shared/modals/dashboard-settings-modal/dashboard-settings-modal.html";

const dashboardController = function dashboardController(
    $scope,
    $q,
    $timeout,
    $interval,
    $location,
    $stateParams,
    $mdDialog,
    DashboardService,
    projectsService,
    UserService,
    $widget,
    $mapper,
    toolsService,
    messageService,
    AuthService
    ) {
    'ngInject';

    const vm = {
        dashboard: null,
        isToolConnected: toolsService.isToolConnected,
    };

    $scope.emptyContent = {
        mobileText: ['No widget added.', 'Go to desktop version for more options or watch tutorial to learn more.'],
        imageUrl: require('../../assets/images/empty-pages/empty_screen_dashboards.svg'),
        showArrow: AuthService.UserHasAnyPermission(['MODIFY_WIDGETS'])
    };

    const emptyContentText = AuthService.UserHasAnyPermission(['MODIFY_WIDGETS']) ?
        'No widget added. Use button at the top or watch tutorial to learn more.' :
        'No widget added';
    $scope.emptyContent.text = [emptyContentText];

    $scope.isPageLoading = true;

    $scope.currentUserId = $location.search().userId;

    $scope.ECHART_TYPES = ['echart', 'PIE', 'LINE', 'BAR', 'TABLE', 'OTHER'];

    $scope.pristineWidgets = [];

    $scope.unexistWidgets = [];

    $scope.dashboard = {};

    $scope.gridstackOptions = {
        disableDrag: true,
        disableResize: true,
        verticalMargin: 20,
        resizable: {
            handles: 'se, sw'
        },
        cellHeight: 20
    };

    $scope.isGridStackEvailableToEdit = function() {
        return !angular.element('.grid-stack-one-column-mode').is(':visible');
    };

    $scope.MODE = '';

    $scope.startEditWidgets = function () {
        angular.element('.grid-stack').gridstack($scope.gridstackOptions).data('gridstack').enable();
        $scope.MODE = 'WIDGET_PLACEMENT';
    };

    $scope.updateWidgetsPosition = function(){
        var widgets = [];
        for(var i = 0; i < $scope.dashboard.widgets.length; i++) {
            var currentWidget = $scope.dashboard.widgets[i];
            var widgetData = {};
            angular.copy(currentWidget, widgetData);
            widgetData.location = JSON.stringify(widgetData.location);
            widgets.push({'id': currentWidget.id, 'location': widgetData.location});
        }
        DashboardService.UpdateDashboardWidgets($stateParams.dashboardId, widgets).then(function (rs) {
            if (rs.success) {
                angular.copy(rs.data, $scope.pristineWidgets);
                $scope.resetGrid();
                messageService.success("Widget positions were updated");
            }
            else {
                messageService.error(rs.message);
            }
            $scope.MODE = '';
        });
    };

    var defaultWidgetLocation = '{ "x":0, "y":0, "width":4, "height":11 }';

    function loadDashboardData (dashboard, refresh) {
        for (var i = 0; i < dashboard.widgets.length; i++) {
            var currentWidget = dashboard.widgets[i];
            currentWidget.location = jsonSafeParse(currentWidget.location);
            if (!refresh || refresh && currentWidget.refreshable) {
                loadWidget(dashboard, currentWidget, dashboard.attributes, refresh);
            }
        }
        angular.copy(dashboard.widgets, $scope.pristineWidgets);
    }

    function loadWidget (dashboard, widget, attributes, refresh) {
        var sqlAdapter, params;
        let func;

        if(! widget.widgetTemplate) {
            sqlAdapter = {'sql': widget.sql, 'attributes': attributes};
            if(!refresh){
                $scope.isLoading = true;
            }
            params = setQueryParams(dashboard.title);
            func = DashboardService.ExecuteWidgetSQL;
        } else {
            widget.builder = widget.builder || {};
            if (!widget.builder.paramsConfigObject) {
                widget.builder.paramsConfigObject = $widget.build(widget, dashboard, $scope.currentUserId);
                widget.builder.legendConfigObject = JSON.parse(widget.legendConfig);
                applyLegend(widget);
            }

            sqlAdapter = {
                "templateId": widget.widgetTemplate.id,
                "paramsConfig": $mapper.map(widget.builder.paramsConfigObject, function(value) {
                    return value.value;
                })
            };

            params = {'stackTraceRequired': false};
            func = DashboardService.ExecuteWidgetTemplateSQL;
        }

        func(params, sqlAdapter).then(function (rs) {
            if (rs.success) {
                var data = rs.data;
                if (!refresh){
                    widget.model = widget.widgetTemplate ? widget.widgetTemplate.chartConfig : widget.model;
                    if ((!widget.widgetTemplate && widget.type !== 'echart') || (widget.widgetTemplate && widget.widgetTemplate.type === 'TABLE')) {
                        widget.model = jsonSafeParse(widget.model);
                    }
                }
                widget.data = {};
                widget.data.dataset = data;
                if (widget.title.toUpperCase().includes("CRON")) {
                    addOnClickConfirm();
                }
                if (data.length !== 0) {
                    $scope.isLoading = false;
                }
            }
            else {
                messageService.error(rs.message);
            }
        });
    }

    function applyLegend(widget) {
        widget.chartActions = widget.chartActions || [];
        angular.forEach(widget.builder.legendConfigObject, function (value, legendName) {
            widget.chartActions.push({type: value ? 'legendSelect' : 'legendUnSelect', name: legendName});
        });
    };

    function getNextEmptyGridArea(defaultLocation) {
        let gridstackElement = angular.element('.grid-stack');
        var gridstack = gridstackElement.gridstack($scope.gridstackOptions).data('gridstack');
        var location = jsonSafeParse(defaultLocation);
        // if at least one widget is present, grid stack element is not undefined
        if(gridstack) {
            while (!gridstack.isAreaEmpty(location.x, location.y, location.width, location.height)) {
                location.y = location.y + 11;
                if (location.y > 1100)
                    break;
            }
        }
        return jsonSafeStringify(location);
    }

    function getNextEmptyGridAreaV2(defaultLocation) {
        var location = jsonSafeParse(defaultLocation);
        let preparedLocation = angular.copy(location);
        const gridstackElement = angular.element('.grid-stack');
        const gridstack = gridstackElement.gridstack($scope.gridstackOptions).data('gridstack');

        // if at least one widget is present, grid stack element is not undefined
        if(gridstack) {
            const grid = gridstack.grid;
            const nodes = grid.nodes;

            const maxYNodes = getMaxNodes(nodes, 'y');
            const maxXYNodes = getMaxNodes(maxYNodes, 'x');
            if (maxXYNodes.length === 1) {
                const maxNode = maxXYNodes[0];
                preparedLocation.x = maxNode.x + maxNode.width;
                preparedLocation.y = maxNode.y;

                const isEmpty = gridstack.isAreaEmpty(preparedLocation.x, preparedLocation.y, preparedLocation.width, preparedLocation.height);
                const outOfWidth = preparedLocation.x + preparedLocation.width > grid.width;
                if (! isEmpty || outOfWidth) {
                    preparedLocation.x = location.x;
                    preparedLocation.y = maxNode.y + location.height + 1;
                }
            }
        }
        return jsonSafeStringify(preparedLocation);
    }

    function getMaxNodes(nodes, key) {
        let maxNodes = undefined;
        let maxNodeValue = undefined;
        nodes.forEach(function (node) {
            const nodeValue = node[key];
            if(maxNodeValue === undefined || (nodeValue > maxNodeValue[key])) {
                maxNodes = [];
                maxNodes.push(node);
                maxNodeValue = node;
            } else if(maxNodes !== undefined && (nodeValue === maxNodeValue[key])) {
                maxNodes.push(node);
            }
        });
        return maxNodes;
    };

    $scope.showDashboardSettingsModal = function(event, dashboard) {
        $mdDialog.show({
            controller: dashboardSettingsModalController,
            template: dashboardSettingsModalTemplate,
            parent: angular.element(document.body),
            targetEvent: event,
            clickOutsideToClose: true,
            fullscreen: true,
            autoWrap: false,
            locals: {
                dashboard: dashboard,
                position : dashboard.position
            }
        })
            .then(function (rs) {
                if(rs) {
                    rs.widgets = $scope.dashboard.widgets;
                    $scope.dashboard = angular.copy(rs);
                    delete rs.action;
                }
            }, function () {
            });
    };

    $scope.addDashboardWidget = function (widget, hideSuccessAlert) {
        widget.location = resolveWidgetLocation(widget);
        var data = {"id": widget.id, "location": widget.location};
        return $q(function (resolve, reject) {
            DashboardService.AddDashboardWidget($stateParams.dashboardId, data).then(function (rs) {
                if (rs.success) {
                    $scope.dashboard.widgets.push(widget);
                    loadDashboardData($scope.dashboard, false);
                    if(! hideSuccessAlert) {
                        messageService.success("Widget added");
                    }
                }
                else {
                    messageService.error(rs.message);
                }
                resolve(rs);
            });
        });
    };

    function resolveWidgetLocation(widget) {
        let widgetLocationStr = angular.copy(defaultWidgetLocation);
        if (widget.defaultSize) {
            let widgetLocation = jsonSafeParse(widgetLocationStr);
            widgetLocation.height = widget.defaultSize.height;
            widgetLocation.width = widget.defaultSize.width;

            widgetLocationStr = jsonSafeStringify(widgetLocation);
        }
        return  getNextEmptyGridAreaV2(widgetLocationStr);
    };

    $scope.deleteDashboardWidget = function (widget) {
        var confirmedDelete = confirm('Would you like to delete widget "' + widget.title + '" from dashboard?');
        if (confirmedDelete) {
            DashboardService.DeleteDashboardWidget($stateParams.dashboardId, widget.id).then(function (rs) {
                if (rs.success) {
                    $scope.dashboard.widgets.splice($scope.dashboard.widgets.indexOf(widget), 1);
                    $scope.dashboard.widgets.forEach(function (widget) {
                        widget.location = jsonSafeStringify(widget.location);
                    });
                    loadDashboardData($scope.dashboard, false);
                    messageService.success("Widget deleted");
                }
                else {
                    messageService.error(rs.message);
                }
            });
        }
    };

    function isJSON(jsonStr) {
        try {
            const json = JSON.parse(jsonStr);

            return (typeof json === 'object');
        } catch (e) {
            return false;
        }
    };

    $scope.resetGrid = function () {
        var gridstack = angular.element('.grid-stack').gridstack($scope.gridstackOptions).data('gridstack');
        //gridstack.batchUpdate();
        $scope.pristineWidgets.forEach(function (widget) {
            const currentWidget = $scope.dashboard.widgets.find(function(w) {
                return widget.id === w.id;
            });

            if (currentWidget) {
                widget.location = jsonSafeParse(widget.location);
                currentWidget.location.x = widget.location.x;
                currentWidget.location.y = widget.location.y;
                currentWidget.location.height = widget.location.height;
                currentWidget.location.width = widget.location.width;
                var element = angular.element('#widget-' + currentWidget.id);

                gridstack.update(element, widget.location.x, widget.location.y,
                    widget.location.width, widget.location.height);
            }
        });
        $scope.MODE = '';
        gridstack && gridstack.disable();
        //gridstack.commit();
    };

    var setQueryParams = function(dashboardName){
        let params = '';

        if (projectsService.selectedProject) {
            params = `?projects=${projectsService.selectedProject.name}`;
        }

        if ($scope.dashboard.attributes && $scope.dashboard.attributes.length) {
            const projectAttributeData = $scope.dashboard.attributes.find(attribute => attribute.key === 'project');

            if (projectAttributeData) {
                params = `?projects=${projectAttributeData.value}`;
            }
        }

        params = params ? params + '&dashboardName=' + dashboardName : params + '?dashboardName=' + dashboardName;

        if ($scope.currentUserId) {
            params = params + '&currentUserId=' + $scope.currentUserId;
        }

        return params;
    };

    $scope.asString = function (value) {
        if (value) {
            value = value.toString();
        }
        return value;
    };

    $scope.isFormatted = function (string) {
        var pattern = /^<.+>.*<\/.+>$/g;
        return pattern.test(string);
    };

    function jsonSafeParse (preparedJson) {
        if (typeof preparedJson === 'string') {
            preparedJson = preparedJson.replace(/^(")|(")$/g, '').replace(/\\/g,'');

            if (isJSON(preparedJson)) {
                return JSON.parse(preparedJson);
            }
        }

        return preparedJson;
    };

    function jsonSafeStringify (preparedJson) {
        if (typeof preparedJson === 'object') {
            return JSON.stringify(preparedJson);
        }

        return preparedJson;
    };

    $scope.sort = {
        column: null,
        descending: false
    };

    $scope.deleteWidget = function($event, widget){
        var confirmedDelete = confirm('Would you like to delete widget "' + widget.title + '" ?');
        if (confirmedDelete) {
            DashboardService.DeleteWidget(widget.id).then(function (rs) {
                if (rs.success) {
                    if($scope.dashboard.widgets.indexOfId(widget.id) >= 0) {
                        $scope.dashboard.widgets.splice($scope.dashboard.widgets.indexOfId(widget.id), 1);
                    }
                    messageService.success("Widget deleted");
                }
                else {
                    messageService.error(rs.message);
                }
            });
        }
    };

    $scope.changeSorting = function(widget, column) {
        var specCharRegexp = /[-[\]{}()*+?.,\\^$|#\s%]/g;

        if (column.search(specCharRegexp) != -1) {
            column.replace("\"\"", "\"");
         }
         if(! widget.sort) {
             widget.sort = {};
             angular.copy($scope.sort, widget.sort);
         }
        if (widget.sort.column == column) {
            widget.sort.descending = !widget.sort.descending;
        } else {
            widget.sort.column = column;
            widget.sort.descending = false;
        }
    };

    /*$scope.deleteDashboard = function(dashboard){
        var confirmedDelete = confirm('Would you like to delete dashboard "' + dashboard.title + '"?');
        if (confirmedDelete) {
            DashboardService.DeleteDashboard(dashboard.id).then(function (rs) {
                if (rs.success) {
                    messageService.success("Dashboard deleted");
                    var mainDashboard = $location.$$absUrl.substring(0, $location.$$absUrl.lastIndexOf('/'));
                    window.open(mainDashboard, '_self');
                }
                else {
                    messageService.error(rs.message);
                }
            });
        }
        $scope.hide();
    };*/

    // didn't find any call of this
    // $scope.showDashboardWidgetDialog = function (event, widget, isNew) {
    //     $mdDialog.show({
    //         controller: 'dashboardWidgetModalController',
    //         template: require('./dashboard-widget-modal/dashboard-widget-modal.html'),
    //         parent: angular.element(document.body),
    //         targetEvent: event,
    //         clickOutsideToClose: true,
    //         fullscreen: true,
    //         locals: {
    //             widget: widget,
    //             isNew: isNew,
    //             dashboardId: $stateParams.dashboardId
    //         }
    //     })
    //         .then(function (rs, action) {
    //         }, function () {
    //         });
    // };

    $scope.showNeededWidgetModal = function(event, widget, isNew, dashboard) {
        if($scope.ECHART_TYPES.indexOf(widget.type) !== -1 && widget.widgetTemplate) {
            $scope.showWidgetWizardDialog(event, widget, dashboard);
        } else {
            $scope.showWidgetDialog(event, widget, isNew, dashboard);
        }
    };

    $scope.showWidgetWizardDialog = function (event, widget, dashboard) {
        $mdDialog.show({
            controller: widgetWizardController,
            template: widgetWizardModalTemplate,
            parent: angular.element(document.body),
            clickOutsideToClose:false,
            targetEvent: event,
            fullscreen: true,
            autoWrap: false,
            escapeToClose:false,
            locals: {
                widget: widget,
                dashboard: dashboard,
                currentUserId: $scope.currentUserId
            }
        })
        .then(function (rs) {
            switch(rs.action) {
                case 'ADD':
                    $scope.addDashboardWidget(rs.widget, true);
                    break;
                case 'CREATE':
                    $scope.addDashboardWidget(rs.widget, true);
                    break;
                case 'UPDATE':
                    const selectedWidget = $scope.dashboard.widgets.find(({ id }) => id === rs.widget.id);

                    if (selectedWidget) {
                        Object.assign(selectedWidget, rs.widget);
                        selectedWidget.location = jsonSafeParse(selectedWidget.location);
                        selectedWidget.builder = {};
                        loadWidget(dashboard, selectedWidget, dashboard.attributes, false);
                    }
                    break;
                case 'DELETE':
                    break;
                default:
                    break;
            }
        }, function () {});
    };

    $scope.showWidgetDialog = function (event, widget, isNew, dashboard) {
        $mdDialog.show({
            controller: widgetDialogController,
            template: widgetDialog,
            parent: angular.element(document.body),
            targetEvent: event,
            clickOutsideToClose: true,
            fullscreen: true,
            locals: {
                widget: widget,
                isNew: isNew,
                dashboard: dashboard,
                currentUserId: $scope.currentUserId
            }
        })
        .then(function (rs) {
            if(rs) {
                switch(rs.action) {
                    case 'CREATE':
                        break;
                    case 'UPDATE':
                        break;
                    default:
                        break;
                }
                delete rs.action;
            }
        }, function () {
        });
    };

    $scope.showEmailDialog = function (event, item) {
        let model = angular.copy(item);

        if (item.widgetTemplate) {
            model.title = $scope.dashboard.title + ' dashboard - ' + item.title + ' widget';
            model.locator = '#widget-container-' + model.id;
        } else {
            model.title = item.title + ' dashboard';
            model.locator = '#dashboard_content';
        }

        $mdDialog.show({
            controller: dashboardEmailModalController,
            template: dashboardEmailModalTemplate,
            controllerAs: '$ctrl',
            parent: angular.element(document.body),
            targetEvent: event,
            clickOutsideToClose: true,
            fullscreen: true,
            locals: {
                model,
            }
        })
        .then(function () {}, function () {});
    };

    var toAttributes = function (qParams) {
        var attributes = [];
        for(var param in qParams) {
            var currentAttribute = {};
            currentAttribute.key = param;
            currentAttribute.value = qParams[param];
            attributes.push(currentAttribute);
        }
        return attributes;
    };

    var getQueryAttributes = function () {
        var qParams = $location.search();
        var qParamsLength = Object.keys(qParams).length;
        if(qParamsLength > 0 && $stateParams.dashboardId) {
            return toAttributes(qParams);
        }
    };

    $scope.getDataWithAttributes = function (dashboard, refresh) {
        var queryAttributes = getQueryAttributes();
        if(queryAttributes) {
            for (var i = 0; i < queryAttributes.length; i++) {
                dashboard.attributes.push(queryAttributes[i]);
            }
        }
        loadDashboardData(dashboard, refresh);
    };

    $scope.optimizeWidget = function (widget, index) {
        if (['table', 'TABLE'].indexOf(widget.type) !== -1 && (Object.size(widget.data.dataset) === 0 || Object.size(widget.data.dataset) === index + 1)) {
            $scope.gridstackOptions.disableResize = false;
            const gridstack = angular.element('.grid-stack').gridstack($scope.gridstackOptions).data('gridstack');
            const el = angular.element('#widget-container-body-' + widget.id)[0];
            const gridstackEl = angular.element('#widget-' + widget.id)[0];
            $timeout(function () {
                const height = (Math.ceil(el.offsetHeight / $scope.gridstackOptions.cellHeight / 2)) + 2;
                if(Object.size(widget.data.dataset) === 0) {
                    gridstack.resize(gridstackEl, widget.location.width, height);
                } else {
                    gridstack.resize(gridstackEl, widget.location.width, height);
                }
                $scope.gridstackOptions.disableResize = true;
            }, 0, false);
        }
    };

    var refreshIntervalInterval;

    function refresh() {
        const currentUser = UserService.currentUser;

        if ($scope.dashboard.title && currentUser.refreshInterval) {
            refreshIntervalInterval = $interval(function () {
                loadDashboardData($scope.dashboard, true);
            }, currentUser.refreshInterval);
        }
    };

    $scope.stopRefreshIntervalInterval = function() {
        if (angular.isDefined(refreshIntervalInterval)) {
            $interval.cancel(refreshIntervalInterval);
            refreshIntervalInterval = undefined;
        }
    };

    function getDashboardById(dashboardId) {
        return $q(function (resolve, reject) {
            DashboardService.GetDashboardById(dashboardId).then(function (rs) {
                if (rs.success) {
                    $scope.dashboard = rs.data;
                    $scope.getDataWithAttributes($scope.dashboard, false);
                    resolve(rs.data);
                } else {
                    reject(rs.message);
                }
                $scope.isPageLoading = false;
            });
        });
    }

    $scope.$watch(
        function() {
            if ($scope.currentUserId && $location.$$search.userId){
                return $scope.currentUserId !== $location.$$search.userId;
            }
        },
        function() {
            if ($scope.currentUserId && $location.$$search.userId) {
                if ($scope.currentUserId !== $location.$$search.userId) {
                    $scope.currentUserId = $location.search().userId;
                    getDashboardById($stateParams.dashboardId);
                }
            }
        }
    );

    $scope.$on("$event:widgetIsUpdated", function () {
        getDashboardById($stateParams.dashboardId);
    });

    $scope.$on('$destroy', function () {
        $scope.stopRefreshIntervalInterval();
        $scope.resetGrid();
    });

    function addOnClickConfirm() {
        $scope.$watch(function () {
            return angular.element('#cron_rerun').is(':visible')
        }, function () {
            var rerunAllLinks = document.getElementsByClassName("cron_rerun_all");
            Array.prototype.forEach.call(rerunAllLinks, function(link) {
                link.addEventListener("click", function (event) {
                    if (!confirm('Rebuild for all tests in cron job will be started. Continue?')) {
                        event.preventDefault();
                    }
                }, false);
            });
            var rerunFailuresLinks = document.getElementsByClassName("cron_rerun_failures");
            Array.prototype.forEach.call(rerunFailuresLinks, function(link) {
                link.addEventListener("click", function (event) {
                    if (!confirm('Rebuild for failures in cron job will be started. Continue?')) {
                        event.preventDefault();
                    }
                }, false);
            });
        });
    }

    function initController() {
        getDashboardById($stateParams.dashboardId).then(function (rs) {
            $timeout(function () {
                refresh();
            }, 0, false);
        });
    }

    vm.$onInit = initController;

    return vm;
};

export default dashboardController;
