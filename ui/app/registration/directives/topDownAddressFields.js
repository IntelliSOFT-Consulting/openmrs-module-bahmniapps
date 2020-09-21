'use strict';

angular.module('bahmni.registration')
    .directive('topDownAddressFields', function () {
        return {
            restrict: 'AE',
            templateUrl: 'views/topDownAddressFields.html',
            controller: 'TopDownAddressFieldsDirectiveController',
            scope: {
                address: '=',
                addressLevels: '=',
                fieldValidation: '=',
                strictAutocompleteFromLevel: '=',
                fieldReadOnly: '=',
                addressType: '='

            }
        };
    })
    .controller('TopDownAddressFieldsDirectiveController', ['$scope', 'addressHierarchyService', 'spinner', '$rootScope', '$timeout', function ($scope, addressHierarchyService, spinner, $rootScope, $timeout) {
        $scope.addressFieldInvalid = false;
        $scope.heiAddressFields = ["cityVillage", "postalCode", "stateProvince"];
        var selectedAddressUuids = {};
        var selectedUserGeneratedIds = {};

        var addressLevelsCloneInDescendingOrder = $scope.addressLevels.slice(0).reverse();
        var newAddress = new Array($scope.addressLevels.length).fill(undefined);
        angular.forEach($scope.addressLevels, function (value, key) {
            value.isStrictEntry = false;
            if (value.addressField === "address1") {
                newAddress.splice(4, 1, value);
            } else if (value.addressField === "address2") {
                newAddress.splice(3, 1, value);
            } else if (value.addressField === "address3") {
                newAddress.splice(2, 1, value);
            } else if (value.addressField === "address4") {
                newAddress.splice(1, 1, value);
            } else if (value.addressField === "address5") {
                newAddress.splice(5, 1, value);
            } else if (value.addressField === "address6") {
                newAddress.splice(6, 1, value);
            } else if (value.addressField === "cityVillage") {
                newAddress.splice(7, 1, value);
            } else if (value.addressField === "stateProvince") {
                newAddress.splice(8, 1, value);
            } else if (value.addressField === "postalCode") {
                newAddress.splice(9, 1, value);
            } else if (value.addressField === "country") {
                newAddress.splice(0, 1, value);
            }
        });
        $scope.addressLevels = newAddress;
        var addressLevelUIOrderBasedOnConfig = $scope.addressLevels;
        $scope.addressLevelsChunks = Bahmni.Common.Util.ArrayUtil.chunk(addressLevelUIOrderBasedOnConfig, 2);
        var addressLevelsNamesInDescendingOrder = addressLevelsCloneInDescendingOrder.map(function (addressLevel) {
            return addressLevel.addressField;
        });

        var populateSelectedAddressUuids = function (levelIndex, parentUuid) {
            if ($scope.addressLevels.length === 0 || !$scope.addressLevels[levelIndex]) {
                return;
            }

            var fieldName = $scope.addressLevels[levelIndex].addressField;
            var addressValue = $scope.address[fieldName];
            if (addressValue) {
                addressHierarchyService.search(fieldName, addressValue, parentUuid).then(function (response) {
                    var address = response && response.data && response.data[0];
                    if (address) {
                        selectedAddressUuids[fieldName] = address.uuid;
                        selectedUserGeneratedIds[fieldName] = address.userGeneratedId;
                        populateSelectedAddressUuids(levelIndex + 1, address.uuid);
                    }
                });
            }
        };

        $scope.addressFieldSelected = function (fieldName) {
            return function (addressFieldItem) {
                selectedAddressUuids[fieldName] = addressFieldItem.addressField.uuid;
                selectedUserGeneratedIds[fieldName] = addressFieldItem.addressField.userGeneratedId;
                $scope.selectedValue[fieldName] = addressFieldItem.addressField.name;

                var parentFields = addressLevelsNamesInDescendingOrder.slice(addressLevelsNamesInDescendingOrder.indexOf(fieldName) + 1);
                var parent = addressFieldItem.addressField.parent;
                parentFields.forEach(function (parentField) {
                    if (!parent) {
                        return;
                    }
                    $scope.address[parentField] = parent.name;
                    $scope.selectedValue[parentField] = parent.name;
                    parent = parent.parent;
                });
            };
        };

        $scope.findParentField = function (fieldName) {
            var found = _.find($scope.addressLevels, { addressField: fieldName });
            var index = _.findIndex($scope.addressLevels, found);
            var parentFieldName;
            var topLevel = 0;
            if (index !== topLevel) {
                var parent = $scope.addressLevels[index - 1];
                parentFieldName = parent.addressField;
            }
            return parentFieldName;
        };

        $scope.isReadOnly = function (addressLevel) {
            if (!$scope.address) {
                return false;
            }
            if (!addressLevel.isStrictEntry) {
                return false;
            }
            var fieldName = addressLevel.addressField;
            $scope.fieldNames = addressLevel.addressField;
            var parentFieldName = $scope.findParentField(fieldName);
            var parentValue = $scope.address[parentFieldName];
            var parentValueInvalid = isParentValueInvalid(parentFieldName);
            if (!parentFieldName) {
                return false;
            }
            if (parentFieldName && !parentValue) {
                return true;
            }
            return parentFieldName && parentValue && parentValueInvalid;
        };

        var isParentValueInvalid = function (parentId) {
            return angular.element($("#" + parentId)).hasClass('illegalValue');
        };

        var parentUuid = function (field) {
            return selectedAddressUuids[$scope.findParentField(field)];
        };

        $scope.getAddressEntryList = function (field) {
            return function (searchAttrs) {
                return addressHierarchyService.search(field, searchAttrs.term, parentUuid(field));
            };
        };

        $scope.getAddressDataResults = addressHierarchyService.getAddressDataResults;
        $scope.clearFields = function (fieldName) {
            var childFields = $scope.addressLevels.slice(0, addressLevelsNamesInDescendingOrder.indexOf(fieldName));
            childFields.forEach(function (childField) {
                if ($scope.selectedValue[childField] !== null) {
                    $scope.address[childField] = null;
                    $scope.selectedValue[childField] = null;
                    selectedAddressUuids[childField] = null;
                    selectedUserGeneratedIds[childField] = null;
                }
            });
            if (fieldName === 'country') {
                // document.getElementById("address5").value = "My values";
                if ($scope.address.country != 'South Sudan') {
                    document.getElementById('address1').disabled = true;
                    document.getElementById('address2').disabled = true;
                    document.getElementById('address3').disabled = true;
                    document.getElementById('address4').disabled = true;
                    document.getElementById('address5').disabled = true;
                    document.getElementById('address6').disabled = true;
                    document.getElementById('cityVillage').disabled = true;
                    document.getElementById('stateProvince').disabled = true;
                    document.getElementById('postalCode').disabled = true;
                } else {
                    document.getElementById('address1').disabled = false;
                    document.getElementById('address2').disabled = false;
                    document.getElementById('address3').disabled = false;
                    document.getElementById('address4').disabled = false;
                    document.getElementById('address5').disabled = false;
                    document.getElementById('address6').disabled = false;
                    document.getElementById('cityVillage').disabled = false;
                    document.getElementById('stateProvince').disabled = false;
                    document.getElementById('postalCode').disabled = false;
                }
            }
            if (_.isEmpty($scope.address[fieldName])) {
                $scope.address[fieldName] = null;
                selectedUserGeneratedIds[fieldName] = null;
            }
        };
        $scope.removeAutoCompleteEntry = function (fieldName) {
            return function () {
                $scope.selectedValue[fieldName] = null;
            };
        };

        var init = function () {
            $scope.addressLevels.reverse();
            var isStrictEntry = false;
            _.each($scope.addressLevels, function (addressLevel) {
                addressLevel.isStrictEntry = $scope.strictAutocompleteFromLevel == addressLevel.addressField || isStrictEntry;
                isStrictEntry = addressLevel.isStrictEntry;
            });
            $scope.addressLevels.reverse();
            $scope.heiAddressFields = ["cityVillage", "postalCode", "stateProvince"];
            // wait for address to be resolved in edit patient scenario
            var deregisterAddressWatch = $scope.$watch('address', function (newValue) {
                if (newValue !== undefined) {
                    populateSelectedAddressUuids(0);
                    $scope.selectedValue = _.mapValues($scope.address, function (value, key) {
                        var addressLevel = _.find($scope.addressLevels, { addressField: key });
                        return addressLevel && addressLevel.isStrictEntry ? value : null;
                    });
                    deregisterAddressWatch();
                }
            });
            $scope.setDefaultCountry = function (fieldName) {
                var promise = $timeout(function () {
                    document.getElementById("country").value = "South Sudan";
                }, 300);

                return promise;
            };
        };
        init();
        $scope.setDefaultCountry();
    }]);
