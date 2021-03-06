'use strict';

import Swiper from 'swiper';

const testExecutionHistoryController = function testExecutionHistoryController(
    $mdMedia,
    $scope,
    $timeout,
    UtilService,
) {
    'ngInject';

    const swiperOptions = {
        freeMode: true,
        initialSlide: 0,
        longSwipesMs: 500,
        mousewheel: {
            forceToAxis: true,
        },
        observer: true,
        shortSwipes: false,
        slidesPerView: 'auto',

        on: {
            click: swiperClickHandler,
        },
    };
    let dataWatchUnsubscriber;
    const vm = {
        activeTestId: null,
        executionHistory: [],
        parentTestId: null,
        swiperContainer: null,
        timeMedian: 0,

        $onInit: controllerInit,
        $onDestroy() { dataWatchUnsubscriber && dataWatchUnsubscriber(); },
        onSlideClick,

        get isMobile() { return $mdMedia('xs'); },
    };

    function controllerInit() {
        $timeout(() => {
            vm.swiperContainer = document.querySelector('.swiper-container');
            dataWatchUnsubscriber = $scope.$watch(
                () => vm.executionHistory,
                (newValue) => {
                    if (newValue?.length) {
                        if (!vm.swiper) {
                            initSwiper();
                        }
                        dataWatchUnsubscriber();
                    }
                },
            );
        }, 0);
    }

    function swiperClickHandler(e) {
        const slideElem = e.target.closest('.swiper-slide');

        if (slideElem) {
            const id = parseInt(slideElem.getAttribute('id'), 10);
            const historyItem = vm.executionHistory.find(({ testId }) => testId === id);

            if (historyItem) {
                onSlideClick(historyItem, true);
            }
        }
    }

    function onSlideClick(historyItem, isSwiperEvent) {
        if (UtilService.isTouchDevice() && !isSwiperEvent) { return; }
        if (historyItem.testId === vm.activeTestId) { return; }

        vm.onTestSelect({ $historyItem: historyItem });
    }

    function initSwiper() {
        if (!vm.swiperContainer || typeof Swiper !== 'function') { return; }

        swiperOptions.initialSlide = vm.executionHistory.length ? vm.executionHistory.length - 1 : 0;
        if (UtilService.isTouchDevice()) {
            swiperOptions.on = {
                click: swiperClickHandler,
            };
        } else {
            swiperOptions.navigation = {
                nextEl: '.swiper-nav-btn._next',
                prevEl: '.swiper-nav-btn._prev',
                disabledClass: '_disabled',
            };
        }
        swiperOptions.allowTouchMove = UtilService.isTouchDevice();
        vm.swiper = new Swiper(vm.swiperContainer, swiperOptions);
    }

    return vm;
};

export default testExecutionHistoryController;
