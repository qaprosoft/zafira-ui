'use strict';

import uploadImageModalController from '../shared/modals/upload-image-modal/upload-image-modal.controller';
import uploadImageModalTemplate from '../shared/modals/upload-image-modal/upload-image-modal.html';

const UserProfileController = function UserProfileController($mdDialog, UserService, DashboardService, UtilService,
                                                             authService, appConfig, $q, $state, messageService, $rootScope, pageTitleService) {
    'ngInject';

    const vm = {
        main: appConfig.main,
        user: {},
        changePassword: {},
        preferences: [],
        preferenceForm: {},
        get dashboards() {return DashboardService.dashboards;},
        pefrDashboardId: null,
        accessToken: null,
        widgetRefreshIntervals: [0, 30000, 60000, 120000, 300000],
        testsVariants: ['runs', 'sessions'],

        copyAccessToken,
        isIntervalSelected,
        isDashboardSelected,
        showUploadImageDialog,
        updateUserProfile,
        updateUserPreference,
        // updateUserPreferences,
        // resetPreferences,
        convertMillis,
        updateUserPassword,
        generateAccessToken,
        validations: UtilService.validations,
        getValidationValue: UtilService.getValidationValue,
        untouchForm: UtilService.untouchForm,
        copyServiceUrl,
        goToState,

        get currentTitle() { return pageTitleService.pageTitle },
        get currentUser() { return UserService.currentUser; },
        get serviceUrl() { return $rootScope.version && $rootScope.version.service_url || ''; },
        get appVersions() { return $rootScope.version; }
    };

    function goToState(state) {
        $state.go(state);
    }

    function isIntervalSelected(interval) {
        return vm.currentUser && vm.currentUser.refreshInterval === interval;
    }

    function updateUserPreference(preferenceForm) {
        const { defaultTests } = preferenceForm;
        const params = {name: 'DEFAULT_TEST_VIEW', value: defaultTests};

        UserService.updateUserPreference(UserService.currentUser.id, params).then((rs) => {
            if (rs.success) {
                UserService.currentUser.testsView = defaultTests;
                messageService.success('User preferences updated');
            } else {
                messageService.error(rs.message);
            }
        });
    }

    function updateUserProfile() {
        const { username, firstName, lastName } = vm.user;

        UserService.updateUserProfile(vm.user.id, { username, firstName, lastName })
            .then(function (rs) {
                if (rs.success) {
                    vm.user = { ...vm.user, ...rs.data };
                    UserService.currentUser.firstName = firstName;
                    UserService.currentUser.lastName = lastName;
                    messageService.success('User profile updated');
                } else {
                    messageService.error(rs.message);
                }
            });
    }

    function generateAccessToken() {
        authService.generateAccessToken()
            .then(function (rs) {
                if (rs.success) {
                    vm.accessToken = rs.data.token;
                }
            });
    }

    function copyAccessToken() {
        vm.accessToken.copyToClipboard();
        messageService.success('Access token copied to clipboard');
    }

    function copyServiceUrl() {
        vm.serviceUrl.copyToClipboard();
        messageService.success('Service URL copied to clipboard');
    }

    function fetchDashboards() {
        DashboardService.RetrieveDashboards();
    }

    function updateUserPassword() {
        const data = angular.copy(vm.changePassword);

        data.userId = vm.user.id;
        UserService.updateUserPassword(data)
            .then(function (rs) {
                if (rs.success) {
                    vm.changePassword = {};
                    messageService.success('Password changed');
                } else {
                    messageService.error(rs.message);
                }
            });
    }

    function fetchUserProfile() {
        UserService.getUserProfile()
            .then(function (rs) {
                if (rs.success) {
                    vm.user = rs.data;
                    vm.changePassword.userId = vm.user.id;
                    if (vm.user.preferences.length) {
                        vm.preferences = vm.user.preferences;
                    } else {
                        fetchDefaultPreferences();
                    }
                } else {
                    messageService.error(rs.message);
                }
            });
    }

    function fetchDefaultPreferences() {
        UserService.getDefaultPreferences().then(function (rs) {
            if (rs.success) {
                    vm.preferences = rs.data;
                } else {
                    messageService.error(rs.message);
                }
            });
    }

    // TODO: enable and refactor when more preferences will be added
    // function updateUserPreferences(preferenceForm) {
    //     const preferences = angular.copy(vm.preferences);

    //     preferences.forEach((item) => {
    //         item.userId = vm.user.id;
    //         switch (item.name) {
    //             case 'DEFAULT_DASHBOARD':
    //                 item.value = preferenceForm.defaultDashboard;
    //                 break;
    //             case 'REFRESH_INTERVAL':
    //                 item.value = parseInt(preferenceForm.refreshInterval, 10);
    //                 break;
    //             case 'DEFAULT_TESTS':
    //                 item.value = preferenceForm.defaultTests;
    //                 break;
    //             case 'THEME':
    //                 item.value = vm.main.skin;
    //             default:
    //                 break;
    //         }
    //     });

    //     UserService.updateUserPreferences(vm.user.id, preferences).then(function (rs) {
    //         if (rs.success) {
    //             vm.preferences = rs.data;
    //             if (rs.data && rs.data.length) {
    //                 UserService.setDefaultPreferences(rs.data);
    //             }
    //             messageService.success('User preferences are successfully updated');
    //         }
    //         else {
    //             messageService.error(rs.message);
    //         }
    //     });
    // }

    // function resetPreferences(preferenceForm) {
    //     UserService.resetUserPreferencesToDefault().then(function (rs) {
    //         if (rs.success) {
    //             vm.preferences = rs.data;
    //             UserService.setDefaultPreferences(vm.preferences);
    //             preferenceForm.refreshInterval = vm.currentUser.refreshInterval;
    //             preferenceForm.defaultDashboard = vm.currentUser.defaultDashboard;
    //             vm.main.skin = vm.currentUser.theme;
    //             messageService.success('Preferences are set to default');
    //         }
    //         else {
    //             messageService.error(rs.message);
    //         }
    //     });
    // }

    function isDashboardSelected(dashboard) {
        return vm.currentUser && vm.currentUser.defaultDashboard === dashboard.title;
    }

    function convertMillis(millis) {
        const sec = millis / 1000;

        if (millis === 0) {
            return 'Disabled'
        } else if (sec < 60) {
            return sec + ' sec';
        } else {
            return sec / 60 + ' min';
        }
    }

    function showUploadImageDialog($event) {
        $mdDialog.show({
            controller: uploadImageModalController,
            controllerAs: '$ctrl',
            template: uploadImageModalTemplate,
            parent: angular.element(document.body),
            targetEvent: $event,
            clickOutsideToClose: true,
            locals: {
                urlHandler: (url) => {
                    if (url) {
                        const { username, firstName, lastName } = vm.user;
                        const params = {
                            username,
                            firstName,
                            lastName,
                            photoURL: url,
                        };

                        return UserService.updateUserProfile(vm.user.id, params)
                            .then((prs) => {
                                if (prs.success) {
                                    vm.currentUser.photoURL = `${url}?${(new Date()).getTime()}`;
                                    messageService.success('Profile was successfully updated');

                                    return true;
                                } else {
                                    messageService.error(prs.message);

                                    return false;
                                }
                            });
                    }

                    return $q.reject(false);
                },
                fileTypes: 'USERS',
            }
        });
    }

    function initController() {
        fetchDashboards();
        fetchUserProfile();
    }

    vm.$onInit = initController;

    return vm;
};

export default UserProfileController;
