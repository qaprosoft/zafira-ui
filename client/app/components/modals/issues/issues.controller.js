'use strict';
const IssuesModalController = function IssuesModalController(
        $scope, $mdDialog, $interval, TestService, test, isNewIssue, toolsService, messageService) {
    'ngInject';

    const vm = {
        isNewIssue: isNewIssue,
        issueJiraIdInputIsChanged: false,
        selectedIssue: false,
        issueJiraIdExists: false,
        issueTabDisabled: true,
        isIssueFound: true,
        isIssueClosed: false,
        test: angular.copy(test),
        testCommentText: '',
        testComments: [],
        issues: [],
        currentStatus: test.status,
        testStatuses: ['PASSED', 'FAILED', 'SKIPPED', 'ABORTED'],
        ticketStatuses: ['TO DO', 'OPEN', 'NOT ASSIGNED', 'IN PROGRESS', 'FIXED', 'REOPENED', 'DUPLICATE'],
        issueStatusIsNotRecognized: false,
        changeStatusIsVisible: false,
        issueListIsVisible: false,
        updateTest: updateTest,
        updateWorkItemList: updateWorkItemList,
        deleteWorkItemFromList: deleteWorkItemFromList,
        deleteWorkItemFromTestWorkItems: deleteWorkItemFromTestWorkItems,
        assignIssue: assignIssue,
        save: save,
        unassignIssue: unassignIssue,
        searchScopeIssue: searchScopeIssue,
        clearIssue: clearIssue,
        initIssueSearch: initIssueSearch,
        hide: hide,
        cancel: cancel,
        bindEvents: bindEvents,
        unassignAction: {
            status: false,
            issue: null
        },
        isToolConnected: toolsService.isToolConnected,
        get isConnectedToJira() { return toolsService.isToolConnected('JIRA'); },
    };

    vm.$onInit = initController;

    return vm;

    function initController() {
        getJiraClosedStatusName();
        initAttachedWorkItems();
        initNewIssue();
        getIssues();
        bindEvents();
    };

    function updateTest(test) {
        TestService.updateTest(test)
            .then(function(rs) {
                if (rs.success) {
                    let message;

                    vm.changeStatusIsVisible = false;
                    message = 'Test was marked as ' + test.status;
                    addTestEvent(message);
                    messageService.success(message);
                } else {
                    console.error(rs.message);
                }
            });
    };

    function updateWorkItemList(workItem) {
        var issues = vm.issues;
        for (var i = 0; i < issues.length; i++) {
            if (issues[i].jiraId === workItem.jiraId) {
                deleteWorkItemFromList(issues[i]);
                break;
            }
        }
        vm.issues.push(workItem);
        vm.test.workItems.push(workItem);
    };

    function deleteWorkItemFromList(workItem) {
        var issueToDelete = vm.issues.filter(function(listWorkItem) {
            return listWorkItem.jiraId === workItem.jiraId;
        })[0];
        var issueIndex = vm.issues.indexOf(issueToDelete);
        if (issueIndex !== -1) {
            vm.issues.splice(issueIndex, 1);
        }
        deleteWorkItemFromTestWorkItems(workItem);
    };

    function deleteWorkItemFromTestWorkItems(workItem) {
        var issueToDelete = vm.test.workItems.filter(
            function(listWorkItem) {
                return listWorkItem.jiraId === workItem.jiraId;
            })[0];
        var workItemIndex = vm.test.workItems.indexOf(issueToDelete);
        if (workItemIndex !== -1) {
            vm.test.workItems.splice(workItemIndex, 1);
        }
    };

    /** ISSUE functionality */

    /* Assigns issue to the test */

    function assignIssue(issue) {
        if (!issue.testCaseId) {
            issue.testCaseId = test.testCaseId;
        }
        TestService.createTestWorkItem(test.id, issue)
            .then((rs) => {
                const workItemType = issue.type;
                const jiraId = issue.jiraId;
                let message;

                if (rs.success) {
                    if (vm.isNewIssue) {
                        message = generateActionResultMessage(workItemType,
                            jiraId, "assigned", true);
                    } else {
                        message = generateActionResultMessage(workItemType,
                            jiraId, "updated", true);
                    }
                    addTestEvent(message);
                    vm.newIssue.id = rs.data.id;
                    updateWorkItemList(rs.data);
                    initAttachedWorkItems();
                    vm.isNewIssue = jiraId !== vm.attachedIssue.jiraId;
                    messageService.success(message);
                } else {
                    if (vm.isNewIssue) {
                        message = generateActionResultMessage(workItemType,
                            jiraId, "assign", false);
                    } else {
                        message = generateActionResultMessage(workItemType,
                            jiraId, "update", false);
                    }
                    messageService.error(message);
                }
            });
    };

    function save(issue) {
        if (vm.unassignAction.status && vm.unassignAction.issue) {
            vm.unassignIssue(vm.unassignAction.issue);
        } else {
            vm.assignIssue(issue);
        }
    };

    /* Unassignes issue from the test */

    function unassignIssue(workItem) {
        TestService.deleteTestWorkItem(test.id, workItem.id)
            .then(function(rs) {
                let  message;

                if (rs.success) {
                    message = generateActionResultMessage(workItem.type,
                        workItem.jiraId, "unassigned", true);
                    addTestEvent(message);
                    deleteWorkItemFromTestWorkItems(workItem);
                    initAttachedWorkItems();
                    initNewIssue();
                    vm.selectedIssue = false;
                    messageService.success(message);
                } else {
                    message = generateActionResultMessage(workItem.type,
                        workItem.jiraId, "unassign", false);
                    messageService.error(message);
                }
                vm.issueJiraIdExists = false;
            });
    };

    /* Starts set in the scope issue search */

    function searchScopeIssue(issue) {
        vm.initIssueSearch();
        initAttachedWorkItems();
        vm.isNewIssue = !(issue.jiraId === vm.attachedIssue.jiraId);
        vm.newIssue.id = issue.id;
        vm.newIssue.jiraId = issue.jiraId;
        vm.newIssue.description = issue.description;
        vm.newIssue.blocker = issue.blocker;
        vm.selectedIssue = true;
        vm.unassignAction.status = false;
    };

    function clearIssue() {
        if (vm.attachedIssue.id === vm.newIssue.id) {
            vm.unassignAction.status = !!vm.newIssue.id;
            vm.unassignAction.issue = angular.copy(vm.newIssue);
        }
        initNewIssue();
        getIssues();
        vm.issueJiraIdExists = false;
        vm.selectedIssue = false;
    };

    /* Initializes issue object before search */

    function initIssueSearch(isInvalid) {
        if (isInvalid) {
            return;
        }
        vm.issueJiraIdExists = false;
        vm.issueJiraIdInputIsChanged = true;
        vm.newIssue.description = '';
        vm.newIssue.id = null;
        vm.newIssue.status = null;
        vm.newIssue.assignee = null;
        vm.newIssue.reporter = null;
        vm.newIssue.blocker = false;
        vm.isIssueClosed = false;
        vm.isIssueFound = false;
        vm.isNewIssue = true;
        vm.unassignAction.status = false;
        var existingIssue = vm.issues.filter(function(foundIssue) {
            return foundIssue.jiraId === vm.newIssue.jiraId;
        })[0];
        if (existingIssue) {
            angular.copy(existingIssue, vm.newIssue);
        }
    };

    /* Writes all attached to the test workitems into scope variables.
    Used for initialization and reinitialization */

    function initAttachedWorkItems() {
        vm.testComments = [];
        var attachedWorkItem = {};
        attachedWorkItem.jiraId = '';
        vm.attachedIssue = attachedWorkItem;
        var workItems = vm.test.workItems;
        for (var i = 0; i < workItems.length; i++) {
            switch (workItems[i].type) {
                case 'BUG':
                    vm.attachedIssue = workItems[i];
                    break;
            }
        }
    };

    /* Searches issue in Jira by Jira ID */

    function searchIssue(issue) {
        vm.isIssueFound = false;
        vm.issueStatusIsNotRecognized = false;
        TestService.getJiraTicket(issue.jiraId).then(function(rs) {
            if (rs.success) {
                var searchResultIssue = rs.data;
                vm.isIssueFound = true;
                if (searchResultIssue === '') {
                    vm.isIssueClosed = false;
                    vm.issueJiraIdExists = false;
                    vm.issueTabDisabled = false;
                    return;
                }
                vm.issueJiraIdExists = true;
                vm.isIssueClosed = vm.closedStatusName.toUpperCase() ===
                    searchResultIssue.status.toUpperCase();
                vm.newIssue.description = searchResultIssue.summary;
                vm.newIssue.assignee = searchResultIssue.assigneeName || '';
                vm.newIssue.reporter = searchResultIssue.reporterName || '';
                vm.newIssue.status = searchResultIssue.status.toUpperCase();
                if (!vm.ticketStatuses.filter(function(status) {
                    return status === vm.newIssue.status;
                })[0]) {
                    vm.issueStatusIsNotRecognized = true;
                }
                vm.isNewIssue = !(vm.newIssue.jiraId ===
                    vm.attachedIssue.jiraId);
                vm.issueTabDisabled = false;
            }
        });
    };

    /*  Checks whether conditions for issue search in Jira are fulfilled */

    function isIssueSearchAvailable(jiraId) {
        if (vm.isToolConnected('JIRA') && jiraId) {
            if (vm.issueTabDisabled || vm.issueJiraIdInputIsChanged) {
                vm.issueJiraIdInputIsChanged = false;
                return true;
            }
        } else {
            vm.isIssueFound = true;
            return false;
        }
    };

    /* Initializes empty issue */

    function initNewIssue(isInit) {
        if (isInit) {
            vm.isNewIssue = isNewIssue;
        } else {
            vm.isNewIssue = true;
        }
        vm.newIssue = {};
        vm.newIssue.type = "BUG";
        vm.newIssue.testCaseId = test.testCaseId;
    };

    /* Gets issues attached to the testcase */

    function getIssues() {
        TestService.getTestCaseWorkItemsByType(test.id, 'BUG').
            then(function(rs) {
                if (rs.success) {
                    vm.issues = rs.data;
                    if (test.workItems.length && !vm.isNewIssue) {
                        angular.copy(vm.attachedIssue, vm.newIssue);
                    }
                } else {
                    messageService.error(rs.message);
                }
            });
    };

    /* Gets from DB JIRA_CLOSED_STATUS name for the current project*/

    function getJiraClosedStatusName() {
        toolsService.fetchIntegrationOfTypeByName('TEST_CASE_MANAGEMENT')
            .then(rs => {
                if (rs.success) {
                    const jira = rs.data.find((data) => data.name === 'JIRA')
                    const setting = jira.settings.find((setting) => setting.param.name === 'JIRA_CLOSED_STATUS');

                    if (setting) {
                        vm.closedStatusName = setting.value.toUpperCase();
                    }
                } else {
                    messageService.error(rs.message);
                }
            });
    }

    /* On Jira ID input change makes search if conditions are fulfilled */

    /* Closes search interval when the modal is closed */
    function bindEvents() {
        let workItemSearchInterval = $interval(function() {
            if (vm.issueJiraIdInputIsChanged) {
                if (isIssueSearchAvailable(vm.newIssue.jiraId)) {
                    searchIssue(vm.newIssue);
                }
            }
        }, 2000);

        $scope.$on('$destroy', function() {
            if (workItemSearchInterval)
                $interval.cancel(workItemSearchInterval);
        });

        let issueOnModalOpenSearch = $interval(function() {
            if (angular.element(document.body).
                hasClass('md-dialog-is-showing')) {
                if (!isIssueSearchAvailable(vm.newIssue.jiraId)) {
                    vm.issueTabDisabled = false;
                } else {
                    searchIssue(vm.newIssue);
                }
                $interval.cancel(issueOnModalOpenSearch);
            }
        }, 500);
    }


    /* Sends request to Jira for issue additional info after opening modal */

    function addTestEvent(message) {
        var testEvent = {};
        testEvent.description = message;
        testEvent.jiraId = Math.floor(Math.random() * 90000) + 10000;
        testEvent.testCaseId = test.testCaseId;
        testEvent.type = 'EVENT';
        TestService.createTestWorkItem(test.id, testEvent).
            then(function(rs) {
                if (rs.success) {
                } else {
                    messageService.error('Failed to add event test "' + test.id);
                }
            })
    };

    /* Generates result message for action comment (needed to be stored into DB and added in UI alert) */

    function generateActionResultMessage(item, id, action, success) {
        if (success) {
            return item + " " + id + " was " + action;
        } else {
            return "Failed to " + action + " " + item.toLowerCase();
        }
    };

    function hide() {
        $mdDialog.hide(test);
    };

    function cancel() {
        $mdDialog.cancel(vm.test);
    };
}

export default IssuesModalController;
