'use strict';

angular.module('bahmni.registration')
    .controller('CreatePatientController', ['$scope', '$rootScope', '$state', 'patientService', 'patient', 'spinner', 'appService', 'messagingService', 'ngDialog', '$q',
        function ($scope, $rootScope, $state, patientService, patient, spinner, appService, messagingService, ngDialog, $q) {
            var dateUtil = Bahmni.Common.Util.DateUtil;
            $scope.actions = {};
            $scope.patient = {};
            var personAttributes = [];
            var errorMessage;
            var configValueForEnterId = appService.getAppDescriptor().getConfigValue('showEnterID');
            $scope.addressHierarchyConfigs = appService.getAppDescriptor().getConfigValue("addressHierarchy");
            $scope.disablePhotoCapture = appService.getAppDescriptor().getConfigValue("disablePhotoCapture");
            $scope.showEnterID = configValueForEnterId === null ? true : configValueForEnterId;
            $scope.today = Bahmni.Common.Util.DateTimeFormatter.getDateWithoutTime(dateUtil.now());

            var getPersonAttributeTypes = function () {
                return $rootScope.patientConfiguration.attributeTypes;
            };

            var initTodaysDate = function () {
                if (personAttributes.length == 0) {
                    personAttributes = _.map($rootScope.patientConfiguration.attributeTypes, function (attribute) {
                        return attribute.name;
                    });
                }
                var personAttributeHasTodaysDate = personAttributes.indexOf("TodaysDate") !== -1;
                var todaysDateAttrName = personAttributeHasTodaysDate ? $rootScope.patientConfiguration.attributeTypes[personAttributes.indexOf("TodaysDate")].name : undefined;
                if (todaysDateAttrName) {
                    $scope.patient[todaysDateAttrName] = Bahmni.Common.Util.DateUtil.today();
                }
                $scope.patient['FacilityName'] = $rootScope.loggedInLocation ? $rootScope.loggedInLocation.name : '';
            };

            var prepopulateDefaultsInFields = function () {
                var personAttributeTypes = getPersonAttributeTypes();
                var patientInformation = appService.getAppDescriptor().getConfigValue("patientInformation");
                if (!patientInformation || !patientInformation.defaults) {
                    return;
                }
                var defaults = patientInformation.defaults;
                var defaultVariableNames = _.keys(defaults);

                var hasDefaultAnswer = function (personAttributeType) {
                    return _.includes(defaultVariableNames, personAttributeType.name);
                };

                var isConcept = function (personAttributeType) {
                    return personAttributeType.format === "org.openmrs.Concept";
                };

                var setDefaultAnswer = function (personAttributeType) {
                    $scope.patient[personAttributeType.name] = defaults[personAttributeType.name];
                };

                var setDefaultConcept = function (personAttributeType) {
                    var defaultAnswer = defaults[personAttributeType.name];
                    var isDefaultAnswer = function (answer) {
                        return answer.fullySpecifiedName === defaultAnswer;
                    };

                    _.chain(personAttributeType.answers).filter(isDefaultAnswer).each(function (answer) {
                        $scope.patient[personAttributeType.name] = {
                            conceptUuid: answer.conceptId,
                            value: answer.fullySpecifiedName
                        };
                    }).value();
                };

                _.chain(personAttributeTypes)
                    .filter(hasDefaultAnswer)
                    .each(setDefaultAnswer).filter(isConcept).each(setDefaultConcept).value();
            };

            var expandSectionsWithDefaultValue = function () {
                angular.forEach($rootScope.patientConfiguration && $rootScope.patientConfiguration.getPatientAttributesSections(), function (section) {
                    var notNullAttribute = _.find(section && section.attributes, function (attribute) {
                        return $scope.patient[attribute.name] !== undefined;
                    });
                    section.expand = false; // section.expand || (!!notNullAttribute);
                });
            };

            var init = function () {
                $scope.patient = patient.create();
                $scope.patient.age.years = 0;
                $scope.patient.age.months = 0;
                $scope.patient.newlyAddedRelationships = [];
                $scope.patient.permanentAddress = {};
                $scope.patient.currentAddress = {};
                prepopulateDefaultsInFields();
                expandSectionsWithDefaultValue();
                initTodaysDate();
                $scope.patientLoaded = false;
                $scope.heiRelationship = false;
                $scope.inEditPatient = false;
            };
            init();

            var prepopulateFields = function () {
                var fieldsToPopulate = appService.getAppDescriptor().getConfigValue("prepopulateFields");
                if (fieldsToPopulate) {
                    _.each(fieldsToPopulate, function (field) {
                        var addressLevel = _.find($scope.addressLevels, function (level) {
                            return level.name === field;
                        });
                        if (addressLevel) {
                            $scope.patient.address[addressLevel.addressField] = $rootScope.loggedInLocation[addressLevel.addressField];
                        }
                    });
                }
            };
            prepopulateFields();

            var addNewRelationships = function () {
                var newRelationships = _.filter($scope.patient.newlyAddedRelationships, function (relationship) {
                    return relationship.relationshipType && relationship.relationshipType.uuid;
                });
                newRelationships = _.each(newRelationships, function (relationship) {
                    delete relationship.patientIdentifier;
                    delete relationship.content;
                    delete relationship.providerName;
                });
                $scope.patient.relationships = newRelationships;
            };

            var getConfirmationViaNgDialog = function (config) {
                var ngDialogLocalScope = config.scope.$new();
                ngDialogLocalScope.yes = function () {
                    ngDialog.close();
                    config.yesCallback();
                };
                ngDialogLocalScope.no = function () {
                    ngDialog.close();
                };
                ngDialog.open({
                    template: config.template,
                    data: config.data,
                    scope: ngDialogLocalScope
                });
            };

            var copyPatientProfileDataToScope = function (response) {
                var patientProfileData = response.data;
                $scope.patient.uuid = patientProfileData.patient.uuid;
                $scope.patient.name = patientProfileData.patient.person.names[0].display;
                $scope.patient.isNew = true;
                $scope.patient.registrationDate = dateUtil.now();
                $scope.patient.newlyAddedRelationships = [];
                $scope.actions.followUpAction(patientProfileData);
            };

            var createPatient = function (jumpAccepted) {
                if (personAttributes.length == 0) {
                    personAttributes = _.map($rootScope.patientConfiguration.attributeTypes, function (attribute) {
                        return attribute.name;
                    });
                }
                var personAttributeHasTypeofPatient = personAttributes.indexOf("TypeofPatient") !== -1;
                var personAttributeTypeofPatient = personAttributeHasTypeofPatient
                    ? $rootScope.patientConfiguration.attributeTypes[personAttributes.indexOf("TypeofPatient")].name : undefined;
                var locName = $rootScope.loggedInLocation ? $rootScope.loggedInLocation.name : null;
                var prefix = '';
                if (locName && locName === 'Juba') {
                    prefix = 'CES/JTH-';
                } else if (locName && locName === 'Nimule') {
                    prefix = 'EES/NMC-';
                }
                var idgenPatientPrefix = {};
                idgenPatientPrefix.identifierPrefix = {};
                idgenPatientPrefix.identifierPrefix.prefix = prefix;
                $scope.patient.permanentAddress.preferred = true;
                $scope.patient.permanentAddress.address15 = "Is permanent dummy address";
                $scope.patient.currentAddress.address15 = "Is current dummy address";
                if (personAttributeTypeofPatient && $scope.patient[personAttributeTypeofPatient] &&
                    ($scope.patient[personAttributeTypeofPatient].value === "NewPatient")) {
                    return spinner.forPromise(patientService.generateIdentifier(idgenPatientPrefix).then(function (response) {
                        var uniqueArtIdentifier = "";
                        if (response && response.data && response.data.length > 0) {
                            response.data = response.data.replace("CES/JTH-", "");
                            response.data = response.data.replace("EES/NMC-", "");
                            var personAttributeHasHealthFacility = personAttributes.indexOf("HealthFacilityName") !== -1;
                            var personAttributeHealthFacility = personAttributeHasHealthFacility
                                ? $rootScope.patientConfiguration.attributeTypes[personAttributes.indexOf("HealthFacilityName")].name : undefined;
                            if (personAttributeHealthFacility && $scope.patient[personAttributeHealthFacility] &&
                                $scope.patient[personAttributeHealthFacility].value === "Juba Teaching Hospital") {
                                uniqueArtIdentifier = _.padStart(response.data, 8, '0');

                                /* var x = Number(uniqueArtIdentifier);
                                Number.prototype.pad = function (size) {
                                    var s = String(this);
                                    while (s.length < (size || 2)) { s = "0" + s; }
                                    return s;
                                };
                                var preserveIdFrom = x + 5875;
                                var padPreservedIdFrom = preserveIdFrom.pad(8); */
                                uniqueArtIdentifier = "CES/JTH-" + uniqueArtIdentifier;
                            }
                            else if (personAttributeHealthFacility && $scope.patient[personAttributeHealthFacility] &&
                                $scope.patient[personAttributeHealthFacility].value === "Nimule") {
                                uniqueArtIdentifier = _.padStart(response.data, 8, '0');
                                uniqueArtIdentifier = "EES/NMC-" + uniqueArtIdentifier;
                            }
                            var personAttributeHasUniqueArtNo = personAttributes.indexOf("UniqueArtNo") !== -1;
                            var personAttributeUniqueArtNo = personAttributeHasUniqueArtNo
                                ? $rootScope.patientConfiguration.attributeTypes[personAttributes.indexOf("UniqueArtNo")].name : undefined;
                            $scope.patient[personAttributeUniqueArtNo] = uniqueArtIdentifier;
                            $scope.patient.primaryIdentifier.preferred = true;
                            $scope.patient.primaryIdentifier.identifier = uniqueArtIdentifier;
                        }
                    })).then(function () {
                        patientService.create($scope.patient, jumpAccepted).then(function (response) {
                            copyPatientProfileDataToScope(response);
                        }, function (response) {
                            if (response.status === 412) {
                                var data = _.map(response.data, function (data) {
                                    return {
                                        sizeOfTheJump: data.sizeOfJump,
                                        identifierName: _.find($rootScope.patientConfiguration.identifierTypes, { uuid: data.identifierType }).name
                                    };
                                });
                                getConfirmationViaNgDialog({
                                    template: 'views/customIdentifierConfirmation.html',
                                    data: data,
                                    scope: $scope,
                                    yesCallback: function () {
                                        return createPatient(true);
                                    }
                                });
                            }
                            if (response.isIdentifierDuplicate) {
                                errorMessage = response.message;
                            }
                        });
                    });
                } else if (personAttributeTypeofPatient && $scope.patient[personAttributeTypeofPatient] &&
                    ($scope.patient[personAttributeTypeofPatient].value === "HeiRelationship")) {
                    var idgenPrefix = {};
                    idgenPrefix.identifierPrefix = {};
                    idgenPrefix.identifierPrefix.prefix = "HEI";
                    return spinner.forPromise(patientService.generateIdentifier(idgenPrefix).then(function (response) {
                        var heiIdentifier = "";
                        if (response && response.data && response.data.length > 0) {
                            response.data = response.data.replace("HEI", "");
                            heiIdentifier = _.padStart(response.data, 4, '0');
                            heiIdentifier = "EXP" + heiIdentifier;
                            var personAttributeHasHei = personAttributes.indexOf("HIVExposedInfant(HEI)No") !== -1;
                            var personAttributeHei = personAttributeHasHei
                                ? $rootScope.patientConfiguration.attributeTypes[personAttributes.indexOf("HIVExposedInfant(HEI)No")].name : undefined;
                            $scope.patient[personAttributeHei] = heiIdentifier;
                            $scope.patient.heiNumber = heiIdentifier;
                        }
                    })).then(spinner.forPromise(patientService.generateIdentifier(idgenPatientPrefix)
                        .then(function (response) {
                            var uniqueIdentifier = "";
                            if (response && response.data && response.data.length > 0) {
                                response.data = response.data.replace("CES/JTH-", "");
                                response.data = response.data.replace("EES/NMC-", "");
                                var personAttributeHasHealthFacility = personAttributes.indexOf("HealthFacilityName") !== -1;
                                var personAttributeHealthFacility = personAttributeHasHealthFacility
                                    ? $rootScope.patientConfiguration.attributeTypes[personAttributes.indexOf("HealthFacilityName")].name : undefined;
                                if (personAttributeHealthFacility && $scope.patient[personAttributeHealthFacility] &&
                                    $scope.patient[personAttributeHealthFacility].value === "Juba Teaching Hospital") {
                                    uniqueIdentifier = _.padStart(response.data, 8, '0');
                                    uniqueIdentifier = "CES/JTH-" + uniqueIdentifier;
                                    $scope.patient.primaryIdentifier.identifier = uniqueIdentifier;
                                    $scope.patient.primaryIdentifier.preferred = true;
                                } else if (personAttributeHealthFacility && $scope.patient[personAttributeHealthFacility] &&
                                    $scope.patient[personAttributeHealthFacility].value === "Nimule") {
                                    uniqueIdentifier = _.padStart(response.data, 8, '0');
                                    uniqueIdentifier = "EES/NMC-" + uniqueIdentifier;
                                    $scope.patient.primaryIdentifier.identifier = uniqueIdentifier;
                                    $scope.patient.primaryIdentifier.preferred = true;
                                }
                            }
                        }))).then(function () {
                            patientService.create($scope.patient, jumpAccepted)
                                .then(function (response) {
                                    copyPatientProfileDataToScope(response);
                                }, function (response) {
                                    if (response.status === 412) {
                                        var data = _.map(response.data, function (data) {
                                            return {
                                                sizeOfTheJump: data.sizeOfJump,
                                                identifierName: _.find($rootScope.patientConfiguration.identifierTypes, { uuid: data.identifierType }).name
                                            };
                                        });
                                        getConfirmationViaNgDialog({
                                            template: 'views/customIdentifierConfirmation.html',
                                            data: data,
                                            scope: $scope,
                                            yesCallback: function () {
                                                return createPatient(true);
                                            }
                                        });
                                    }
                                    if (response.isIdentifierDuplicate) {
                                        errorMessage = response.message;
                                    }
                                });
                        });
                } else {
                    var personAttributeHasUniqueArtNo = personAttributes.indexOf("UniqueArtNo") !== -1;
                    var personAttributeUniqueArtNo = personAttributeHasUniqueArtNo
                        ? $rootScope.patientConfiguration.attributeTypes[personAttributes.indexOf("UniqueArtNo")].name : undefined;
                    $scope.patient.primaryIdentifier.identifier = $scope.patient[personAttributeUniqueArtNo] || "";
                    $scope.patient.primaryIdentifier.preferred = true;
                    return patientService.create($scope.patient, jumpAccepted).then(function (response) {
                        copyPatientProfileDataToScope(response);
                    }, function (response) {
                        if (response.status === 412) {
                            var data = _.map(response.data, function (data) {
                                return {
                                    sizeOfTheJump: data.sizeOfJump,
                                    identifierName: _.find($rootScope.patientConfiguration.identifierTypes, { uuid: data.identifierType }).name
                                };
                            });
                            getConfirmationViaNgDialog({
                                template: 'views/customIdentifierConfirmation.html',
                                data: data,
                                scope: $scope,
                                yesCallback: function () {
                                    return createPatient(true);
                                }
                            });
                        }
                        if (response.isIdentifierDuplicate) {
                            errorMessage = response.message;
                        }
                    });
                }
            };

            var createPromise = function () {
                var deferred = $q.defer();
                createPatient().finally(function () {
                    return deferred.resolve({});
                });
                return deferred.promise;
            };

            var validateAgeBirthdateForHeiType = function () {
                var patientType = $scope.patient['TypeofPatient'].value;
                if (patientType === 'HeiRelationship' || patientType === 'ExistingHeiRelationship') {
                    var ageYr = $scope.patient.age.years;
                    var ageMth = $scope.patient.age.months;
                    if (!((ageYr === 0 && ageMth <= 12) || (ageYr === 1 && ageMth <= 6))) {
                        return "HEI child is not an infant!";
                    }
                }
                return "";
            };

            var validateUniqueArtNo = function () {
                var personAttributeHasTypeofPatient = personAttributes.indexOf("TypeofPatient") !== -1;
                var personAttributeTypeofPatient = personAttributeHasTypeofPatient
                    ? $rootScope.patientConfiguration.attributeTypes[personAttributes.indexOf("TypeofPatient")].name : undefined;
                if (personAttributeTypeofPatient && $scope.patient[personAttributeTypeofPatient] &&
                    ($scope.patient[personAttributeTypeofPatient].value === "ExistingPatient")) {
                    var personAttributeHasUniqueArtNo = personAttributes.indexOf("UniqueArtNo") !== -1;
                    var personAttributeUniqueArtNo = personAttributeHasUniqueArtNo
                        ? $rootScope.patientConfiguration.attributeTypes[personAttributes.indexOf("UniqueArtNo")].name : undefined;
                    var uniqueArt = $scope.patient[personAttributeUniqueArtNo];
                    var personAttributeHasHealthFacility = personAttributes.indexOf("HealthFacilityName") !== -1;
                    var personAttributeHealthFacility = personAttributeHasHealthFacility
                        ? $rootScope.patientConfiguration.attributeTypes[personAttributes.indexOf("HealthFacilityName")].name : undefined;
                    if (personAttributeHealthFacility && $scope.patient[personAttributeHealthFacility] &&
                        $scope.patient[personAttributeHealthFacility].value === "Juba Teaching Hospital") {
                        var numericPart = uniqueArt.substring("CES/JTH-".length);
                        if (uniqueArt && !(uniqueArt.startsWith("CES/JTH-") && uniqueArt.length === 16
                            && numericPart.length === 8 && Number(numericPart) > 0)) {
                            return "Unique art no should be 16 characters starting with CES/JTH-";
                        }
                    } else if (personAttributeHealthFacility && $scope.patient[personAttributeHealthFacility] &&
                        $scope.patient[personAttributeHealthFacility].value === "Nimule") {
                        var numericPart = uniqueArt.substring("EES/NMC-".length);
                        if (uniqueArt && !(uniqueArt.startsWith("EES/NMC-") && uniqueArt.length === 16
                            && numericPart.length === 8 && Number(numericPart) > 0)) {
                            return "Unique art no should be 16 characters starting with EES/NMC-";
                        }
                    }
                }
                return "";
            };

            $scope.create = function () {
                addNewRelationships();
                var errorMessages = Bahmni.Common.Util.ValidationUtil.validate($scope.patient, $scope.patientConfiguration.attributeTypes);
                var customValidateArtMsg = validateUniqueArtNo();
                if (customValidateArtMsg !== "") {
                    errorMessages.push(customValidateArtMsg);
                }
                customValidateArtMsg = validateAgeBirthdateForHeiType();
                if (customValidateArtMsg !== "") {
                    errorMessages.push(customValidateArtMsg);
                }
                if (errorMessages.length > 0) {
                    errorMessages.forEach(function (errorMessage) {
                        messagingService.showMessage('error', errorMessage);
                    });
                    return $q.when({});
                }
                return spinner.forPromise(createPromise()).then(function (response) {
                    if (errorMessage) {
                        messagingService.showMessage("error", errorMessage);
                        errorMessage = undefined;
                    }
                });
            };

            $scope.afterSave = function () {
                messagingService.showMessage("info", "REGISTRATION_LABEL_SAVED");
                $state.go("patient.edit", {
                    patientUuid: $scope.patient.uuid
                });
            };
        }
    ]);
