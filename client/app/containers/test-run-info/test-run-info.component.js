import template from './test-run-info.html';
import controller from './test-run-info.controller';

const testRunInfoComponent = {
    template,
    controller,
    bindings: {
        test: '<',
        testRun: '<',
        configSnapshot: '<',
    },
};

export default testRunInfoComponent;
