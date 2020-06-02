(function() {
    'use strict';

    angular
        .module('app.services')
        .factory('InvitationService', ['$httpMock', '$rootScope', '$state', '$httpParamSerializer', 'UtilService', 'UserService', 'API_URL', InvitationService])

    function InvitationService($httpMock, $rootScope, $state, $httpParamSerializer, UtilService, UserService, API_URL) {
        let invitations = [];
        const service = {
            invite,
            retryInvite,
            getAllInvitations,
            search,
            deleteInvitation,
            get invitations() {
                return invitations;
            },
            set invitations(data) {
                invitations = data;
            }
        };

        return service;

        function invite(invitations) {
            return $httpMock.post(API_URL + '/api/invitations', invitations).then(UtilService.handleSuccess, UtilService.handleError('Failed to invite users'));
        }

        function retryInvite(invitation) {
            return $httpMock.post(API_URL + '/api/invitations/retry', invitation).then(UtilService.handleSuccess, UtilService.handleError('Failed to retry user invitation'));
        }

        function getAllInvitations() {
            return $httpMock.get(API_URL + '/api/invitations/all').then(UtilService.handleSuccess, UtilService.handleError('Failed to get all user invitations'));
        }

        function search(sc) {
            var path = $httpParamSerializer({query: sc.query, page: sc.page, pageSize: sc.pageSize, orderBy: sc.orderBy, sortOrder: sc.sortOrder});
            return $httpMock.get(API_URL + '/api/invitations/search?' + path).then(UtilService.handleSuccess, UtilService.handleError('Failed to search user invitations'));
        }

        function deleteInvitation(idOrEmail) {
            return $httpMock.delete(API_URL + '/api/invitations/' + idOrEmail).then(UtilService.handleSuccess, UtilService.handleError('Failed to delete user invitation'));
        }

    }
})();
