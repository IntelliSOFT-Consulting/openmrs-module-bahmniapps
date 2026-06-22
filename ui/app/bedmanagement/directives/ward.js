'use strict';

angular.module('bahmni.ipd')
    .directive('ward', [function () {
        return {
            restrict: 'E',
            controller: "WardController",
            scope: {
                ward: "=",
                reservedRoomKeys: "="
            },
            templateUrl: "../bedmanagement/views/ward.html"
        };
    }]);
