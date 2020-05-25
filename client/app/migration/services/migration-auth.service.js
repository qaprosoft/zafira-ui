import { from, of } from 'rxjs';

export const MigrationAuthService = (
    $rootScope,
    MigrationRequestService,
) => {
    'ngInject';

    return {
        login,
        handleLogin,
    };

    function login(username, password) {
        return from(MigrationRequestService.post('/api/auth/login', { username, password })
            .then(res => ({ data: res.data, firstLogin: res.headers()['first-login'] })));
    }

    function handleLogin(payload) {
        $rootScope.$broadcast('event:auth-loginSuccess', payload);
        return of(true);
    }
}