'use strict';

angular.module('bahmni.clinical')
    .controller('AddTreatmentController', ['$scope', '$rootScope', 'contextChangeHandler', 'treatmentConfig', 'drugService',
        '$timeout', 'clinicalAppConfigService', 'ngDialog', '$window', 'messagingService', 'appService', 'activeDrugOrders',
        'orderSetService', '$q', 'locationService', 'spinner', '$translate', 'treatmentService', '$http',
        function ($scope, $rootScope, contextChangeHandler, treatmentConfig, drugService, $timeout,
            clinicalAppConfigService, ngDialog, $window, messagingService, appService, activeDrugOrders,
            orderSetService, $q, locationService, spinner, $translate, treatmentService, $http) {
            var DateUtil = Bahmni.Common.Util.DateUtil;
            var DrugOrderViewModel = Bahmni.Clinical.DrugOrderViewModel;
            var scrollTop = _.partial($window.scrollTo, 0, 0);
            $scope.showOrderSetDetails = true;
            $scope.addTreatment = true;
            $scope.canOrderSetBeAdded = true;
            $scope.isSearchDisabled = false;
            $scope.getFilteredOrderSets = function (searchTerm) {
                if (searchTerm && searchTerm.length >= 3) {
                    orderSetService.getOrderSetsByQuery(searchTerm).then(function (response) {
                        $scope.orderSets = response.data.results;
                        _.each($scope.orderSets, function (orderSet) {
                            _.each(orderSet.orderSetMembers, setUpOrderSetTransactionalData);
                        });
                    });
                } else {
                    $scope.orderSets = {};
                }
            };

            $scope.treatmentActionLinks = clinicalAppConfigService.getTreatmentActionLink();

            var preFetchDrugsForGivenConceptSet = function () {
                drugService.getSetMembersOfConcept(treatmentConfig.getDrugConceptSet()).then(function (result) {
                    $scope.drugs = result.map(Bahmni.Clinical.DrugSearchResult.create);
                });
            };
            if (treatmentConfig.isDropDownForGivenConceptSet()) {
                preFetchDrugsForGivenConceptSet();
            }
            if (treatmentConfig.isAutoCompleteForAllConcepts()) {
                $scope.getDrugs = function (request) {
                    return drugService.search(request.term);
                };
            }
            if (treatmentConfig.isAutoCompleteForGivenConceptSet()) {
                $scope.getDrugs = function (request) {
                    return drugService.getSetMembersOfConcept(treatmentConfig.getDrugConceptSet(), request.term);
                };
            }

            $scope.doseFractions = treatmentConfig.getDoseFractions();

            $scope.hideOrderSet = treatmentConfig.inputOptionsConfig.hideOrderSet;

            $scope.showDoseFractions = treatmentConfig.inputOptionsConfig.showDoseFractions;
            $scope.isDoseFractionsAvailable = function () {
                return $scope.doseFractions && !_.isEmpty($scope.doseFractions) ? true : false;
            };

            $scope.isSelected = function (drug) {
                var selectedDrug = $scope.treatment.drug;
                return selectedDrug && drug.drug.name === selectedDrug.name;
            };

            $scope.selectFromDefaultDrugList = function () {
                $scope.onSelect($scope.treatment.selectedItem);
            };

            var markVariable = function (variable) {
                $scope[variable] = true;
                $timeout(function () {
                    $scope[variable] = false;
                });
            };

            var markEitherVariableDrugOrUniformDrug = function (drug) {
                if (drug.isVariableDosingType()) {
                    markVariable('editDrugEntryVariableFrequency');
                } else {
                    markVariable('editDrugEntryUniformFrequency');
                }
            };

            markVariable("startNewDrugEntry");

            var setDrugOrderBeingEdited, clearHighlights;
            (function () {
                var drugOrderBeingEdited = null;

                setDrugOrderBeingEdited = function (drugOder) {
                    drugOrderBeingEdited = drugOder;
                };

                clearHighlights = function () {
                    $scope.treatments.forEach(setIsNotBeingEdited);
                    $scope.orderSetTreatments.forEach(setIsNotBeingEdited);
                    if (drugOrderBeingEdited) {
                        drugOrderBeingEdited.isBeingEdited = false;
                        drugOrderBeingEdited.isDiscontinuedAllowed = true;
                    }
                };
            })();

            var encounterDate = DateUtil.parse($scope.consultation.encounterDateTime);
            var newTreatment = function () {
                var newTreatment = new Bahmni.Clinical.DrugOrderViewModel(treatmentConfig, null, encounterDate);
                newTreatment.isEditAllowed = false;
                return newTreatment;
            };

            $scope.treatment = newTreatment();
            treatmentConfig.durationUnits.forEach(function (durationUnit) {
                if (_.isEqual(durationUnit, $scope.treatment.durationUnit)) {
                    $scope.treatment.durationUnit = durationUnit;
                }
            });

            var watchFunctionForQuantity = function () {
                var treatment = $scope.treatment;
                return {
                    uniformDosingType: treatment.uniformDosingType,
                    variableDosingType: treatment.variableDosingType,
                    doseUnits: treatment.doseUnits,
                    duration: treatment.duration,
                    durationUnit: treatment.durationUnit
                };
            };

            var isSameDrugBeingDiscontinuedAndOrdered = function () {
                var existingTreatment = false;
                angular.forEach($scope.consultation.discontinuedDrugs, function (drugOrder) {
                    existingTreatment = _.some($scope.treatments, function (treatment) {
                        return treatment.getDisplayName() === drugOrder.getDisplayName();
                    }) && drugOrder.isMarkedForDiscontinue;
                });
                return existingTreatment;
            };

            var clearOtherDrugOrderActions = function (drugOrders) {
                drugOrders.forEach(function (drugOrder) {
                    drugOrder.isDiscontinuedAllowed = true;
                    drugOrder.isBeingEdited = false;
                });
            };

            var setNonCodedDrugConcept = function (treatment) {
                if (treatment.drugNonCoded) {
                    treatment.concept = treatmentConfig.nonCodedDrugconcept;
                }
            };

            $scope.refillDrug = function (drugOrder, alreadyActiveSimilarOrder) {
                $scope.bulkSelectCheckbox = false;
                var existingOrderStopDate = alreadyActiveSimilarOrder ? alreadyActiveSimilarOrder.effectiveStopDate : null;
                var refillDrugOrder = drugOrder.refill(existingOrderStopDate);
                setNonCodedDrugConcept(refillDrugOrder);
                setDrugOrderBeingEdited(drugOrder);
                $scope.treatments.push(refillDrugOrder);
                markVariable("startNewDrugEntry");
                ngDialog.close();
            };

            $scope.refillOrderSet = function (drugOrder) {
                ngDialog.close();
                var drugOrdersOfOrderGroup = _.filter($scope.consultation.activeAndScheduledDrugOrders, function (treatment) {
                    return treatment.orderGroupUuid === drugOrder.orderGroupUuid;
                });

                var refilledOrderGroupOrders = [];
                drugOrdersOfOrderGroup.forEach(function (drugOrder) {
                    setNonCodedDrugConcept(drugOrder);
                    if (drugOrder.effectiveStopDate) {
                        refilledOrderGroupOrders.push(drugOrder.refill());
                    }
                });

                setSortWeightForOrderSetDrugs(refilledOrderGroupOrders);

                // Fetch the orderSet for the drugOrder
                var matchedOrderSet = _.find(orderSets, { uuid: drugOrder.orderSetUuid });

                // Find the drugs in ordered DrugOrderSet which matches with the matchedOrderSet SetMembers
                var orderSetMembersOfMatchedOrderSet = matchedOrderSet.orderSetMembers;
                var matchedMembers = [];

                _.each(refilledOrderGroupOrders, function (drugOrder) {
                    _.each(orderSetMembersOfMatchedOrderSet, function (orderSetMember) {
                        if (orderSetMember.orderTemplate.drug) {
                            if (orderSetMember.orderTemplate.drug.uuid === _.get(drugOrder, 'drug.uuid')) { matchedMembers.push(orderSetMember); }
                        } else {
                            if (orderSetMember.concept.uuid === drugOrder.concept.uuid) { matchedMembers.push(orderSetMember); }
                        }
                    });
                });

                var listOfPromises = _.map(matchedMembers, function (eachMember, index) {
                    if (eachMember.orderTemplate) {
                        var doseUnits = eachMember.orderTemplate.dosingInstructions.doseUnits;
                        var baseDose = eachMember.orderTemplate.dosingInstructions.dose;
                        var drugName = eachMember.orderTemplate.concept.name;
                        return orderSetService.getCalculatedDose($scope.patient.uuid, drugName, baseDose, doseUnits, $scope.newOrderSet.name)
                            .then(function (calculatedDosage) {
                                refilledOrderGroupOrders[index].uniformDosingType.dose = calculatedDosage.dose;
                                refilledOrderGroupOrders[index].uniformDosingType.doseUnits = calculatedDosage.doseUnit;
                                refilledOrderGroupOrders[index].calculateQuantityAndUnit();
                            });
                    }
                });

                spinner.forPromise($q.all(listOfPromises).then(function () {
                    Array.prototype.push.apply($scope.treatments, refilledOrderGroupOrders);
                }));
            };

            $scope.$on("event:refillDrugOrder", function (event, drugOrder, alreadyActiveSimilarOrder) {
                // Todo -- Removed orderset refill logic , since its needs more analysis

                /* if (drugOrder.orderGroupUuid) {
                    ngDialog.open({
                        template: 'consultation/views/treatmentSections/refillDrugOrderSetModal.html',
                        scope: $scope,
                        data: {
                            drugOrder: drugOrder,
                            alreadyActiveSimilarOrder: alreadyActiveSimilarOrder
                        }
                    });
                    $scope.popupActive = true;
                    return;
                } */

                $scope.refillDrug(drugOrder, alreadyActiveSimilarOrder);
            });

            var refillDrugOrders = function (drugOrders) {
                drugOrders.forEach(function (drugOrder) {
                    setNonCodedDrugConcept(drugOrder);
                    if (drugOrder.effectiveStopDate) {
                        var refill = drugOrder.refill();
                        $scope.treatments.push(refill);
                    }
                });
            };

            $scope.$on("event:sectionUpdated", function (event, drugOrder) {
                _.remove($scope.consultation.activeAndScheduledDrugOrders, function (activeOrder) {
                    return activeOrder.uuid === drugOrder.uuid;
                });
            });

            $scope.$on("event:refillDrugOrders", function (event, drugOrders) {
                $scope.bulkSelectCheckbox = false;
                refillDrugOrders(drugOrders);
            });

            $scope.$on("event:discontinueDrugOrder", function (event, drugOrder) {
                drugOrder.isMarkedForDiscontinue = true;
                drugOrder.isEditAllowed = false;
                drugOrder.dateStopped = DateUtil.now();
                $scope.consultation.discontinuedDrugs.push(drugOrder);
                $scope.minDateStopped = DateUtil.getDateWithoutTime(drugOrder.effectiveStartDate < DateUtil.now() ? drugOrder.effectiveStartDate : DateUtil.now());
            });

            $scope.$on("event:undoDiscontinueDrugOrder", function (event, drugOrder) {
                $scope.consultation.discontinuedDrugs = _.reject($scope.consultation.discontinuedDrugs, function (removableOrder) {
                    return removableOrder.uuid === drugOrder.uuid;
                });
                $scope.consultation.removableDrugs = _.reject($scope.consultation.removableDrugs, function (removableOrder) {
                    return removableOrder.previousOrderUuid === drugOrder.uuid;
                });
                drugOrder.orderReasonConcept = null;
                drugOrder.dateStopped = null;
                drugOrder.orderReasonText = null;
                drugOrder.isMarkedForDiscontinue = false;
                drugOrder.isEditAllowed = true;
            });

            var selectDrugFromDropdown = function (drug_) {
                if (treatmentConfig.isDropDownForGivenConceptSet()) {
                    $scope.treatment.selectedItem = _.find($scope.drugs, function (drug) {
                        return drug.drug.uuid === drug_.uuid;
                    });
                }
            };

            $scope.$on("event:reviseDrugOrder", function (event, drugOrder, drugOrders) {
                clearOtherDrugOrderActions(drugOrders);
                drugOrder.isBeingEdited = true;
                drugOrder.isDiscontinuedAllowed = false;
                $scope.treatments.forEach(setIsNotBeingEdited);
                setDrugOrderBeingEdited(drugOrder);
                $scope.treatment = drugOrder.revise();
                selectDrugFromDropdown(drugOrder.drug);
                markEitherVariableDrugOrUniformDrug($scope.treatment);
                $scope.treatment.currentIndex = $scope.treatments.length + 1;
                if ($scope.treatment.frequencyType === Bahmni.Clinical.Constants.dosingTypes.variable) {
                    $scope.treatment.isUniformFrequency = false;
                }
                $scope.treatment.quantity = $scope.treatment.quantity ? $scope.treatment.quantity : null;
            });

            $scope.$watch(watchFunctionForQuantity, function () {
                $scope.treatment.calculateQuantityAndUnit();
            }, true);

            $scope.add = function () {
                var treatments = $scope.treatments;
                if ($scope.treatment.isNewOrderSet) {
                    treatments = $scope.orderSetTreatments;
                }
                $scope.treatment.dosingInstructionType = Bahmni.Clinical.Constants.flexibleDosingInstructionsClass;
                if ($scope.treatment.isNonCodedDrug) {
                    $scope.treatment.drugNonCoded = $scope.treatment.drugNameDisplay;
                }
                $scope.treatment.setUniformDoseFraction();
                var newDrugOrder = $scope.treatment;
                setNonCodedDrugConcept($scope.treatment);

                newDrugOrder.calculateEffectiveStopDate();

                if (getConflictingDrugOrder(newDrugOrder)) {
                    if ($scope.alreadyActiveSimilarOrder.isNewOrderSet) {
                        $scope.conflictingIndex = _.findIndex($scope.orderSetTreatments, $scope.alreadyActiveSimilarOrder);
                    } else {
                        $scope.conflictingIndex = _.findIndex($scope.treatments, $scope.alreadyActiveSimilarOrder);
                    }
                    ngDialog.open({
                        template: 'consultation/views/treatmentSections/conflictingDrugOrderModal.html',
                        scope: $scope
                    });
                    $scope.popupActive = true;
                    return;
                }
                if (!$scope.treatment.quantity) {
                    $scope.treatment.quantity = 0;
                }

                if ($scope.treatment.isBeingEdited) {
                    treatments.splice($scope.treatment.currentIndex, 1, $scope.treatment);
                    $scope.treatment.isBeingEdited = false;
                } else {
                    treatments.push($scope.treatment);
                }
                $scope.clearForm();
            };

            var getConflictingDrugOrder = function (newDrugOrder) {
                var allDrugOrders = $scope.treatments.concat($scope.orderSetTreatments);
                allDrugOrders = _.reject(allDrugOrders, newDrugOrder);
                var unsavedNotBeingEditedOrders = _.filter(allDrugOrders, { isBeingEdited: false });
                var existingDrugOrders;
                if (newDrugOrder.isBeingEdited) {
                    existingDrugOrders = _.reject($scope.consultation.activeAndScheduledDrugOrders, { uuid: newDrugOrder.previousOrderUuid });
                } else {
                    existingDrugOrders = $scope.consultation.activeAndScheduledDrugOrders;
                }
                existingDrugOrders = existingDrugOrders.concat(unsavedNotBeingEditedOrders);

                var potentiallyOverlappingOrders = existingDrugOrders.filter(function (drugOrder) {
                    return (drugOrder.getDisplayName() === newDrugOrder.getDisplayName() && drugOrder.overlappingScheduledWith(newDrugOrder));
                });

                setEffectiveDates(newDrugOrder, potentiallyOverlappingOrders);

                var alreadyActiveSimilarOrders = existingDrugOrders.filter(function (drugOrder) {
                    return (drugOrder.getDisplayName() === newDrugOrder.getDisplayName() && drugOrder.overlappingScheduledWith(newDrugOrder));
                });

                if (alreadyActiveSimilarOrders.length > 0) {
                    $scope.alreadyActiveSimilarOrder = _.sortBy(potentiallyOverlappingOrders, 'effectiveStartDate').reverse()[0];
                    return $scope.alreadyActiveSimilarOrder;
                }
                return false;
            };

            var isEffectiveStartDateSameAsToday = function (newDrugOrder) {
                return DateUtil.isSameDate(newDrugOrder.effectiveStartDate, DateUtil.parse(newDrugOrder.encounterDate)) &&
                    DateUtil.isSameDate(newDrugOrder.effectiveStartDate, DateUtil.now());
            };

            var setEffectiveDates = function (newDrugOrder, existingDrugOrders) {
                newDrugOrder.scheduledDate = newDrugOrder.effectiveStartDate;
                existingDrugOrders.forEach(function (existingDrugOrder) {
                    if (DateUtil.isSameDate(existingDrugOrder.effectiveStartDate, newDrugOrder.effectiveStopDate) && !DateUtil.isSameDate(existingDrugOrder.effectiveStopDate, newDrugOrder.effectiveStartDate)) {
                        if (!newDrugOrder.previousOrderUuid || newDrugOrder.previousOrderDurationInDays === newDrugOrder.durationInDays) {
                            newDrugOrder.effectiveStopDate = DateUtil.subtractSeconds(existingDrugOrder.effectiveStartDate, 1);
                        }
                        if (newDrugOrder.previousOrderUuid || DateUtil.isSameDate(newDrugOrder.effectiveStartDate, newDrugOrder.encounterDate)) {
                            newDrugOrder.autoExpireDate = newDrugOrder.effectiveStopDate;
                        }
                    }
                    if (DateUtil.isSameDate(existingDrugOrder.effectiveStopDate, newDrugOrder.effectiveStartDate) && DateUtil.isSameDate(DateUtil.addSeconds(existingDrugOrder.effectiveStopDate, 1), newDrugOrder.effectiveStartDate)) { // compare date part only of datetime
                        if (!existingDrugOrder.uuid) {
                            existingDrugOrder.effectiveStopDate = DateUtil.subtractSeconds(existingDrugOrder.effectiveStopDate, 1);
                        }
                        newDrugOrder.effectiveStartDate = DateUtil.addSeconds(existingDrugOrder.effectiveStopDate, 1);
                    }
                });
                if (isEffectiveStartDateSameAsToday(newDrugOrder)) {
                    newDrugOrder.scheduledDate = null;
                }
            };

            $scope.closeDialog = function () {
                ngDialog.close();
            };

            $scope.refillConflictingDrug = function (drugOrder, alreadyActiveSimilarOrder) {
                $scope.popupActive = false;
                ngDialog.close();
                $scope.clearForm();
                $scope.$broadcast("event:refillDrugOrder", drugOrder, alreadyActiveSimilarOrder);
            };

            $scope.revise = function (drugOrder, index) {
                $scope.popupActive = false;
                ngDialog.close();
                if (drugOrder.uuid) {
                    $scope.$broadcast("event:reviseDrugOrder", drugOrder, $scope.consultation.activeAndScheduledDrugOrders);
                } else {
                    edit(drugOrder, index);
                }
            };

            $scope.toggleShowAdditionalInstructions = function (treatment) {
                treatment.showAdditionalInstructions = !treatment.showAdditionalInstructions;
            };

            $scope.toggleAsNeeded = function (treatment) {
                treatment.asNeeded = !treatment.asNeeded;
            };

            var edit = function (drugOrder, index) {
                clearHighlights();
                var treatment = drugOrder;
                markEitherVariableDrugOrUniformDrug(treatment);
                treatment.isBeingEdited = true;
                $scope.treatment = treatment.cloneForEdit(index, treatmentConfig);
                if ($scope.treatment.quantity === 0) {
                    $scope.treatment.quantity = null;
                    $scope.treatment.quantityEnteredManually = false;
                }
                selectDrugFromDropdown(treatment.drug);
            };

            $scope.$on("event:editDrugOrder", function (event, drugOrder, index) {
                edit(drugOrder, index);
            });

            $scope.$on("event:removeDrugOrder", function (event, index) {
                $scope.treatments.splice(index, 1);
            });

            $scope.incompleteDrugOrders = function () {
                var anyValuesFilled = $scope.treatment.drug || $scope.treatment.uniformDosingType.dose ||
                    $scope.treatment.uniformDosingType.frequency || $scope.treatment.variableDosingType.morningDose ||
                    $scope.treatment.variableDosingType.afternoonDose || $scope.treatment.variableDosingType.eveningDose ||
                    $scope.treatment.duration || $scope.treatment.quantity || $scope.treatment.isNonCodedDrug || $scope.treatment.drugNameDisplay;
                return (anyValuesFilled && $scope.addForm.$invalid);
            };
            $scope.unaddedDrugOrders = function () {
                return $scope.addForm.$valid;
            };

            var contextChange = function () {
                var errorMessages = Bahmni.Clinical.Constants.errorMessages;
                if (isSameDrugBeingDiscontinuedAndOrdered()) {
                    return { allow: false, errorMessage: $translate.instant(errorMessages.discontinuingAndOrderingSameDrug) };
                }
                if ($scope.incompleteDrugOrders()) {
                    $scope.formInvalid = true;
                    return { allow: false };
                }
                if ($scope.unaddedDrugOrders()) {
                    return { allow: false, errorMessage: $translate.instant(errorMessages.incompleteForm) };
                }
                return { allow: true };
            };

            var setIsNotBeingEdited = function (treatment) {
                treatment.isBeingEdited = false;
            };

            $scope.stoppedOrderReasons = treatmentConfig.stoppedOrderReasonConcepts;
            $scope.getDataResults = function (drugs) {
                var searchString = $scope.treatment.drugNameDisplay;
                var listOfDrugSynonyms = _.map(drugs, function (drug) {
                    var drugavailable = Bahmni.Clinical.DrugSearchResult.getAllMatchingSynonyms(drug, searchString);
                    return Bahmni.Clinical.DrugSearchResult.getAllMatchingSynonyms(drug, searchString);
                });
                return _.flatten(listOfDrugSynonyms);
            };
            (function () {
                var selectedItem;
                var presentdrugs = [];
                $scope.onSelect = function (item) {
                    var a1 = "9062c6d9-a650-44d2-8929-da84f617c427";
                    var b1 = "c22e6700-a937-4909-b4ad-e82ff51325ac";
                    var c1 = "a00d9620-e88b-4c2f-9293-b1ac9e5943f2";
                    var d1 = "5d500ca2-350a-49ee-a3d4-f340db32ff31";
                    var e1 = "3fd242a8-7ade-463c-8919-d82573ea8526";
                    var f1 = "91f5d0d6-eb81-484f-9376-4bfb926a5a81";
                    var g1 = "0dd3e78f-e1fc-47de-95bc-1f489d0dfcc5";
                    var h1 = "4a86fbee-07a9-422a-bf69-16256c0c2b8b";
                    var j1 = "03224cae-f115-4814-bd53-c99c72288446";

                    var a2 = "bd97cacd-4a91-4901-8803-3a4a2e5f1ca8";
                    var b2 = "ad6ff4ef-769e-4aec-b8bb-7f033fe6aaaa";
                    var c2 = "47167ec1-4957-4d0a-a58c-3894bdeb93ff";
                    var d2 = "e649a0ec-e193-4af0-bb49-02687107a893";
                    var e2 = "accca537-b8ee-41ec-b902-7de814d099b2";
                    var f2 = "77f201fc-aefc-4068-baa7-cb3284782a38";
                    var g2 = "cb0f9fcd-fb52-493f-95aa-d0197387fbdb";
                    var h2 = "28790bde-81db-4490-806b-ac10c17b41dc";
                    var i2 = "aae69cae-2806-4e8b-a916-f22ed733a19b";
                    var j2 = "64336206-c9bc-4d37-accf-c7abac7a37f6";
                    var k2 = "25f0cca5-902d-4e36-9e4f-5ce5da744a75";

                    var a4 = "c224b116-27ec-4156-93ba-d4838a3ac1c0";
                    var b4 = "5efe8d99-c65e-4136-8820-5f3646437ff7";
                    var c4 = "f8f64be8-ccb4-404d-b99e-3c4975155da5";
                    var d4 = "28c5d192-ba71-4ef5-8604-ecf6bd177126";
                    var f4 = "0372f3fb-5e8a-474f-8250-01af7a485778";
                    var g4 = "ce2412c4-a041-4328-bfaa-35e041ca4802";
                    var h4 = "6ed47806-8809-4c5a-a1b6-fe2ec0158563";
                    var i4 = "f6b1c6ea-b0a2-46a0-b7e0-3038d268356c";
                    var j4 = "2e1ab9d3-7fe1-48ba-a12c-fd8d26bc161d";
                    var k4 = "99f54f96-e761-4d86-bb1b-0abc2a24fa16";
                    var l4 = "5287f2a4-23e5-4314-b60c-0a4b91753ec6";

                    var a5 = "b23cf614-dfec-48c9-a12f-ba577e28347d";
                    var b5 = "dabc93c3-8c3d-41e1-b3e3-d7e14c4765b6";
                    var c5 = "da3c6710-c431-4582-a444-a466d54693ec";
                    var d5 = "6c383d11-2b29-4cc2-bfa4-811ff7a988f1";
                    var e5 = "82725d14-00c6-4864-bf8b-ad5db0b3c3fa";
                    var f5 = "140ede93-5691-463b-9d17-2dc8834621f8";
                    var g5 = "06017ac1-2ce8-4689-a3bf-4e9f3d54978f";
                    var h5 = "2c0a5b91-7b2a-4f8e-86fd-a8007841fca8";
                    var i5 = "50b60d77-186d-4a0d-8784-659ee2d60ec9";

                    var AZTNVP = "f2744208-2187-11ea-978f-2e728ce88125";
                    var AZT3TCLPVr = "4f39254b-dfe7-4a42-82f9-0052bf9b5e70";
                    var AZT3TCNVP = "ea30af59-cea5-431c-aef2-b42366c272de";
                    var ABC3TCLPVr = "31130f2b-524d-4c26-a2a4-05d7c3bb9f33";
                    var ABC3TCEFV = "19daabc4-057e-4ab7-b58b-c51d3fb6de01";
                    var AZT3TCRAL = "192573f6-1bbb-45ac-84e6-cd6aebc6ea9e";

                    var ABC3TCRAL = "22cbf310-9a1e-4b49-8ba2-2c4a3810ae67";
                    var AZT3TCEFV = "60a5990d-8f4d-4320-ae4b-452e79fb334c";
                    var ABC3TCDTG = "e071d3a4-28e3-409d-97a5-89cc039d2afb";
                    var TDF3TCDTG = "6d8fca22-3acd-42c3-b022-0ad418cf34be";
                    var TDF3TCEFV = "1faf6726-72df-4390-9768-b3bc1c594509";
                    var ABCn3TCpDTG = "c471f1d7-d50f-4003-96dd-20c1d709f2b7";
                    var AZTn3TCEFV = "057a59b0-19e1-43c5-9680-8defc05ed54f";
                    var ABCn3TCpLPVnr = "b0456e76-fafd-4ce2-b397-ecbc87541940";

                    var ABCp3TCnAZT = "6df50daa-514c-48d7-917e-a677d5847ea4";
                    var ABCn3TCLPVrRTV = "061160e0-ca02-455e-9642-b6326cd54584";
                    var ABCn3TCdoubledoseDTG = "c2d14a27-7b96-4529-bece-48a87e85fb86";
                    var ABCn3TCEFV = "c0636109-3ff1-4b0a-b4e7-357ebd0afc66";

                    for (var i = treatmentService.prescribedDrugOrders.length - 1; i >= 0; i--) {
                        if (treatmentService.prescribedDrugOrders[i].concept.uuid == a1 || treatmentService.prescribedDrugOrders[i].concept.uuid == b1 || treatmentService.prescribedDrugOrders[i].concept.uuid == c1 || treatmentService.prescribedDrugOrders[i].concept.uuid == d1 || treatmentService.prescribedDrugOrders[i].concept.uuid == e1 || treatmentService.prescribedDrugOrders[i].concept.uuid == f1 || treatmentService.prescribedDrugOrders[i].concept.uuid == g1 || treatmentService.prescribedDrugOrders[i].concept.uuid == h1 || treatmentService.prescribedDrugOrders[i].concept.uuid == a4 || treatmentService.prescribedDrugOrders[i].concept.uuid == b4 || treatmentService.prescribedDrugOrders[i].concept.uuid == c4 || treatmentService.prescribedDrugOrders[i].concept.uuid == d4 || treatmentService.prescribedDrugOrders[i].concept.uuid == f4 || treatmentService.prescribedDrugOrders[i].concept.uuid == g4 || treatmentService.prescribedDrugOrders[i].concept.uuid == h4 || treatmentService.prescribedDrugOrders[i].concept.uuid == i4 || treatmentService.prescribedDrugOrders[i].concept.uuid == j4 || treatmentService.prescribedDrugOrders[i].concept.uuid == k4 || treatmentService.prescribedDrugOrders[i].concept.uuid == l4) {
                            presentdrugs.push(treatmentService.prescribedDrugOrders[i].concept.uuid);
                        }
                    }

                    selectedItem = item;
                    if (selectedItem.drug.uuid == a2 || selectedItem.drug.uuid == b2 || selectedItem.drug.uuid == c2 || selectedItem.drug.uuid == d2 || selectedItem.drug.uuid == e2 || selectedItem.drug.uuid == f2 || selectedItem.drug.uuid == g2 || selectedItem.drug.uuid == h2 || selectedItem.drug.uuid == i2 || selectedItem.drug.uuid == j2 || selectedItem.drug.uuid == k2
                        || selectedItem.drug.uuid == a5 || selectedItem.drug.uuid == b5 || selectedItem.drug.uuid == c5 || selectedItem.drug.uuid == d5 || selectedItem.drug.uuid == e5 || selectedItem.drug.uuid == f5 || selectedItem.drug.uuid == g5 || selectedItem.drug.uuid == h5 || selectedItem.drug.uuid == i5) {
                        if (presentdrugs === undefined || presentdrugs.length == 0) {
                            ngDialog.open({
                                template: 'consultation/views/treatmentSections/conflictingOrderSet.html'
                            });
                            $scope.popupActive = true;
                            clearForm();
                        } else {
                            console.log(".");
                        }
                    }
                    var patientAge = $scope.patient.age;
                    const birthdate = new Date($scope.patient.birthdate);
                    var today = new Date();
                    var diffTime = Math.abs(today - birthdate);
                    var diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24) - 1);

                    var patientWeight = $scope.patientWeight;
                    var artRegimens = [{ uuid: a1 }, { uuid: b1 }, { uuid: c1 }, { uuid: d1 }, { uuid: e1 }, { uuid: f1 }, { uuid: g1 }, { uuid: h1 }, { uuid: j1 },
                    { uuid: a2 }, { uuid: b2 }, { uuid: c2 }, { uuid: d2 }, { uuid: e2 }, { uuid: f2 }, { uuid: g2 }, { uuid: h2 }, { uuid: i2 }, { uuid: j2 }, { uuid: k2 },
                    { uuid: a4 }, { uuid: b4 }, { uuid: c4 }, { uuid: d4 }, { uuid: f4 }, { uuid: g4 }, { uuid: h4 }, { uuid: i4 }, { uuid: j4 }, { uuid: k4 }, { uuid: l4 },
                    { uuid: a5 }, { uuid: b5 }, { uuid: c5 }, { uuid: d5 }, { uuid: f5 }, { uuid: g5 }, { uuid: h5 }, { uuid: i5 }
                    ];

                    var neonates = [{ uuid: AZT3TCLPVr }];
                    var neonatesRegimens = neonates.filter(regimen => selectedItem.drug.uuid.includes(regimen.uuid));

                    var childrenlessthanTwenty = [{ uuid: ABC3TCLPVr }, { uuid: AZT3TCRAL }, { uuid: AZT3TCLPVr }, { uuid: ABC3TCRAL }, { uuid: AZT3TCEFV }];
                    var childrenlessthanTwentyRegimens = childrenlessthanTwenty.filter(regimen => selectedItem.drug.uuid.includes(regimen.uuid));

                    var childrenlessthanTwentyAbovethree = [{ uuid: ABC3TCEFV }, { uuid: AZT3TCRAL }, { uuid: AZT3TCLPVr }, { uuid: ABC3TCRAL }, { uuid: AZT3TCEFV }];
                    var childrenlessthanTwentyAbovethreeRegimen = childrenlessthanTwentyAbovethree.filter(regimen => selectedItem.drug.uuid.includes(regimen.uuid));

                    var childrenweightoftwentyandaboveandlessthanthirty = [{ uuid: ABC3TCDTG }, { uuid: ABC3TCLPVr }, { uuid: ABC3TCRAL }, { uuid: ABC3TCEFV }, { uuid: AZT3TCEFV }, { uuid: AZT3TCLPVr }, { uuid: AZT3TCRAL }];
                    var childrenweightoftwentyandaboveandlessthanthirtyRegimen = childrenweightoftwentyandaboveandlessthanthirty.filter(regimen => selectedItem.drug.uuid.includes(regimen.uuid));

                    var childrenweightofthirtyandabove = [{ uuid: TDF3TCDTG }, { uuid: TDF3TCEFV }, { uuid: ABCn3TCpDTG }, { uuid: AZTn3TCEFV }, { uuid: ABCn3TCpLPVnr }];
                    var childrenweightofthirtyandaboveRegimen = childrenweightofthirtyandabove.filter(regimen => selectedItem.drug.uuid.includes(regimen.uuid));

                    var childrenwithtbduringart = [{ uuid: ABCp3TCnAZT }, { uuid: ABCn3TCLPVrRTV }, { uuid: ABCn3TCdoubledoseDTG }, { uuid: ABCn3TCEFV }];
                    var childrenwithtbduringartRegimen = childrenwithtbduringart.filter(regimen => selectedItem.drug.uuid.includes(regimen.uuid));

                    // lpvr
                    var filteredRegimens = artRegimens.filter(regimen => selectedItem.drug.uuid.includes(regimen.uuid));
                    if ((diffDays <= 28) && (selectedItem.drug.dosageForm.display == "HIVTC, ART Regimen") && (neonatesRegimens.length == 0)) {
                        ngDialog.open({
                            template: 'consultation/views/treatmentSections/drugPopUpForLPVr.html'
                        });
                        $scope.popupActive = true;
                        clearForm();
                    } else {
                        console.log(".");
                    }
                    if ((patientAge < 3) && (patientWeight < 20) && (selectedItem.drug.dosageForm.display == "HIVTC, ART Regimen") && (childrenlessthanTwentyRegimens.length == 0)) {
                        ngDialog.open({
                            template: 'consultation/views/treatmentSections/weightlessthantwentythreeyears.html'
                        });
                        $scope.popupActive = true;
                        clearForm();
                    } else {
                        console.log(".");
                    }
                    if ((patientAge >= 3) && (patientWeight < 20) && (selectedItem.drug.dosageForm.display == "HIVTC, ART Regimen") && (childrenlessthanTwentyAbovethreeRegimen.length == 0)) {
                        ngDialog.open({
                            template: 'consultation/views/treatmentSections/weightabovethreeandtwentythreeyears.html'
                        });
                        $scope.popupActive = true;
                        clearForm();
                    } else {
                        console.log(".");
                    }
                    if ((patientAge <= 14) && (patientWeight >= 20) && (patientWeight < 30) && (selectedItem.drug.dosageForm.display == "HIVTC, ART Regimen") && (childrenweightoftwentyandaboveandlessthanthirtyRegimen.length == 0)) {
                        ngDialog.open({
                            template: 'consultation/views/treatmentSections/weightabovetentyandlessthanthirty.html'
                        });
                        $scope.popupActive = true;
                        clearForm();
                    } else {
                        console.log(".");
                    }
                    if ((patientAge <= 14) && (patientWeight >= 30) && (selectedItem.drug.dosageForm.display == "HIVTC, ART Regimen") && (childrenweightofthirtyandaboveRegimen.length == 0)) {
                        ngDialog.open({
                            template: 'consultation/views/treatmentSections/weightofthiryandabove.html'
                        });
                        $scope.popupActive = true;
                        clearForm();
                    } else {
                        console.log(".");
                    }

                    if ((diffDays > 28) && (patientAge < 3) && (selectedItem.drug.dosageForm.display == "HIVTC, ART Regimen") && (childrenwithtbduringartRegimen.length == 0)) {
                        ngDialog.open({
                            template: 'consultation/views/treatmentSections/childrenwithtb.html'
                        });
                        $scope.popupActive = true;
                        clearForm();
                    } else {
                        console.log(".");
                    }

                    // if ((patientAge <= 2) && (patientWeight >= 3.5 && patientWeight <= 9.9) && (filteredRegimens.length >= 1) && (selectedItem.drug.dosageForm.display == "HIVTC, ART Regimen") && (selectedItem.drug.uuid != "c46684dd-8534-43d3-af53-673b37b9130a")) {
                    //     console.log("selected drug", $scope.firstPcrResult);
                    //     ngDialog.open({
                    //         template: 'consultation/views/treatmentSections/drugPopUpForAbc3tclpvr.html'
                    //     });
                    //     $scope.popupActive = true;
                    //     clearForm();
                    // } else {
                    //     console.log(".");
                    // }

                    $scope.onChange();
                };

                $scope.onAccept = function () {
                    $scope.treatment.acceptedItem = $scope.treatment.drugNameDisplay;
                    $scope.onChange();
                };

                $scope.onChange = function () {
                    if (selectedItem) {
                        $scope.treatment.isNonCodedDrug = false;
                        delete $scope.treatment.drugNonCoded;
                        $scope.treatment.changeDrug({
                            name: selectedItem.drug.name,
                            form: selectedItem.drug.dosageForm && selectedItem.drug.dosageForm.display,
                            uuid: selectedItem.drug.uuid
                        });
                        selectedItem = null;
                        return;
                    }
                    if ($scope.treatment.acceptedItem) {
                        $scope.treatment.isNonCodedDrug = !$scope.treatment.isNonCodedDrug;
                        $scope.treatment.drugNonCoded = $scope.treatment.acceptedItem;
                        delete $scope.treatment.drug;
                        delete $scope.treatment.acceptedItem;
                        return;
                    }
                    delete $scope.treatment.drug;
                };
            })();

            $scope.clearForm = function () {
                $scope.treatment = newTreatment();
                $scope.formInvalid = false;
                clearHighlights();
                markVariable("startNewDrugEntry");
            };

            $scope.openActionLink = function (extension) {
                var url, location;
                locationService.getLoggedInLocation().then(function (response) {
                    location = response.name;
                    url = extension.url
                        .replace("{{patient_ref}}", $scope.patient.identifier)
                        .replace("{{location_ref}}", location);
                    $window.open(url, "_blank");
                });
            };

            $scope.toggleTabIndexWithinModal = function (event) {
                var buttonsToFocusOn = ["modal-revise-button", "modal-refill-button"];
                var focusedButton = event.target;
                focusedButton.tabIndex = 1;

                buttonsToFocusOn.splice(buttonsToFocusOn.indexOf(focusedButton.id), 1);
                var otherButton = buttonsToFocusOn[0];
                $("#" + otherButton)[0].tabIndex = 2;
            };

            $scope.toggleDrugOrderAttribute = function (orderAttribute) {
                orderAttribute.value = orderAttribute.value ? false : true;
            };
            contextChangeHandler.add(contextChange);

            var getActiveDrugOrders = function (activeDrugOrders) {
                var activeDrugOrdersList = activeDrugOrders || [];
                return activeDrugOrdersList.map(function (drugOrder) {
                    return DrugOrderViewModel.createFromContract(drugOrder, treatmentConfig);
                });
            };

            var removeOrder = function (removableOrder) {
                removableOrder.action = Bahmni.Clinical.Constants.orderActions.discontinue;
                removableOrder.previousOrderUuid = removableOrder.uuid;
                removableOrder.uuid = undefined;
                $scope.consultation.removableDrugs.push(removableOrder);
            };

            var saveTreatment = function () {
                var tabNames = Object.keys($scope.consultation.newlyAddedTabTreatments || {});
                var allTreatmentsAcrossTabs = _.flatten(_.map(tabNames, function (tabName) {
                    return $scope.consultation.newlyAddedTabTreatments[tabName].treatments;
                }));
                var orderSetTreatmentsAcrossTabs = _.flatten(_.map(tabNames, function (tabName) {
                    return $scope.consultation.newlyAddedTabTreatments[tabName].orderSetTreatments;
                }));
                var includedOrderSetTreatments = _.filter(orderSetTreatmentsAcrossTabs, function (treatment) {
                    return treatment.orderSetUuid ? treatment.include : true;
                });
                $scope.consultation.newlyAddedTreatments = allTreatmentsAcrossTabs.concat(includedOrderSetTreatments);
                if ($scope.consultation.discontinuedDrugs) {
                    $scope.consultation.discontinuedDrugs.forEach(function (discontinuedDrug) {
                        var removableOrder = _.find(activeDrugOrders, { uuid: discontinuedDrug.uuid });
                        if (discontinuedDrug) {
                            removableOrder.orderReasonText = discontinuedDrug.orderReasonText;
                            removableOrder.dateActivated = null;
                            removableOrder.scheduledDate = discontinuedDrug.dateStopped;
                            removableOrder.dateStopped = discontinuedDrug.dateStopped;

                            if (discontinuedDrug.orderReasonConcept && discontinuedDrug.orderReasonConcept.name) {
                                removableOrder.orderReasonConcept = {
                                    name: discontinuedDrug.orderReasonConcept.name.name,
                                    uuid: discontinuedDrug.orderReasonConcept.uuid
                                };
                            }
                        }
                        if (removableOrder) {
                            removeOrder(removableOrder);
                        }
                    });
                }
            };

            var putCalculatedDose = function (orderTemplate) {
                var visitUuid = treatmentConfig.orderSet.calculateDoseOnlyOnCurrentVisitValues ? $scope.activeVisit.uuid : undefined;
                var calculatedDose = orderSetService.getCalculatedDose(
                    $scope.patient.uuid,
                    orderTemplate.concept.name,
                    orderTemplate.dosingInstructions.dose,
                    orderTemplate.dosingInstructions.doseUnits,
                    $scope.newOrderSet.name,
                    orderTemplate.dosingInstructions.dosingRule,
                    visitUuid
                );
                if (calculatedDose.$$state.status == 0) $scope.isSearchDisabled = false;
                return calculatedDose.then(function (calculatedDosage) {
                    orderTemplate.dosingInstructions.dose = calculatedDosage.dose;
                    orderTemplate.dosingInstructions.doseUnits = calculatedDosage.doseUnit;
                    return orderTemplate;
                });
            };

            var deleteDrugIfEmpty = function (template) {
                if (_.isEmpty(template.drug)) {
                    delete template.drug; // _.isEmpty({}) is true.
                }
            };

            var setUpOrderSetTransactionalData = function (orderSetMember) {
                orderSetMember.orderTemplateMetaData = orderSetMember.orderTemplate;
                orderSetMember.orderTemplate = JSON.parse(orderSetMember.orderTemplate);
                orderSetMember.orderTemplate.concept = {
                    name: orderSetMember.concept.display,
                    uuid: orderSetMember.concept.uuid
                };
                deleteDrugIfEmpty(orderSetMember.orderTemplate);
            };
            var calculateDoseForTemplatesIn = function (orderSet) {
                $scope.newOrderSet.name = orderSet.name;
                var orderSetMemberTemplates = _.map(orderSet.orderSetMembers, 'orderTemplate');
                var promisesToCalculateDose = _.map(orderSetMemberTemplates, putCalculatedDose);
                var returnOrderSet = function () { return orderSet; };
                return $q.all(promisesToCalculateDose).then(returnOrderSet);
            };
            var createDrugOrderViewModel = function (orderTemplate) {
                orderTemplate.effectiveStartDate = $scope.newOrderSet.date;
                var drugOrder = Bahmni.Clinical.DrugOrder.create(orderTemplate);
                var drugOrderViewModel = Bahmni.Clinical.DrugOrderViewModel.createFromContract(drugOrder, treatmentConfig);
                drugOrderViewModel.instructions = orderTemplate.administrationInstructions;
                drugOrderViewModel.additionalInstructions = orderTemplate.additionalInstructions;
                drugOrderViewModel.isNewOrderSet = true;
                drugOrderViewModel.dosingInstructionType = Bahmni.Clinical.Constants.flexibleDosingInstructionsClass;
                drugOrderViewModel.quantity = drugOrderViewModel.quantity || 0;
                drugOrderViewModel.calculateDurationUnit();
                drugOrderViewModel.calculateQuantityAndUnit();
                drugOrderViewModel.calculateEffectiveStopDate();
                drugOrderViewModel.setUniformDoseFraction();
                return drugOrderViewModel;
            };

            var setSortWeightForOrderSetDrugs = function (orderSetDrugs) {
                _.each(orderSetDrugs, function (drugOrder, index) {
                    if (drugOrder.sortWeight !== undefined) {
                        drugOrder.sortWeight = drugOrder.sortWeight + orderSetDrugs.length;
                    } else {
                        drugOrder.sortWeight = index + 1;
                    }
                });
            };

            var createDrugOrdersAndGetConflicts = function (orderSet) {
                var conflictingDrugOrders = [];
                var orderSetMemberTemplates = _.map(orderSet.orderSetMembers, 'orderTemplate');
                _.each(orderSetMemberTemplates, function (orderTemplate) {
                    var drugOrderViewModel = createDrugOrderViewModel(orderTemplate);
                    drugOrderViewModel.orderSetUuid = orderSet.uuid;
                    var conflictingDrugOrder = getConflictingDrugOrder(drugOrderViewModel);
                    if (!conflictingDrugOrder) {
                        drugOrderViewModel.include = true;
                    } else {
                        conflictingDrugOrders.push(conflictingDrugOrder);
                    }
                    $scope.orderSetTreatments.push(drugOrderViewModel);
                });
                setSortWeightForOrderSetDrugs($scope.orderSetTreatments);
                return conflictingDrugOrders;
            };
            var showConflictMessageIfAny = function (conflictingDrugOrders) {
                if (_.isEmpty(conflictingDrugOrders)) {
                    return;
                }
                _.each($scope.orderSetTreatments, function (orderSetDrugOrder) {
                    orderSetDrugOrder.include = false;
                });
                ngDialog.open({
                    template: 'consultation/views/treatmentSections/conflictingOrderSet.html',
                    data: { 'conflictingDrugOrders': conflictingDrugOrders }
                });
                $scope.popupActive = true;
            };
            $scope.addOrderSet = function (orderSet) {
                $scope.isSearchDisabled = true;
                scrollTop();
                var setUpNewOrderSet = function () {
                    $scope.newOrderSet.name = orderSet.name;
                    $scope.newOrderSet.uuid = orderSet.uuid;
                    $scope.isSearchDisabled = true;
                };
                calculateDoseForTemplatesIn(orderSet)
                    .then(createDrugOrdersAndGetConflicts)
                    .then(showConflictMessageIfAny)
                    .then(setUpNewOrderSet);
            };

            $scope.removeOrderSet = function () {
                $scope.isSearchDisabled = false;
                delete $scope.newOrderSet.name;
                delete $scope.newOrderSet.uuid;
                $scope.orderSetTreatments.splice(0, $scope.orderSetTreatments.length);
            };

            $scope.$on("event:includeOrderSetDrugOrder", function (event, drugOrder) {
                var conflictingDrugOrder = getConflictingDrugOrder(drugOrder);
                if (conflictingDrugOrder) {
                    drugOrder.include = false;
                    ngDialog.open({
                        template: 'consultation/views/treatmentSections/conflictingOrderSet.html',
                        data: { 'conflictingDrugOrders': [conflictingDrugOrder] }
                    });
                    $scope.popupActive = true;
                }
            });

            $scope.consultation.preSaveHandler.register("drugOrderSaveHandlerKey", saveTreatment);

            var mergeActiveAndScheduledWithDiscontinuedOrders = function () {
                _.each($scope.consultation.discontinuedDrugs, function (discontinuedDrug) {
                    _.remove($scope.consultation.activeAndScheduledDrugOrders, { 'uuid': discontinuedDrug.uuid });
                    $scope.consultation.activeAndScheduledDrugOrders.push(discontinuedDrug);
                });
            };

            var init = function () {
                $scope.consultation.removableDrugs = $scope.consultation.removableDrugs || [];
                $scope.consultation.discontinuedDrugs = $scope.consultation.discontinuedDrugs || [];
                $scope.consultation.drugOrdersWithUpdatedOrderAttributes = $scope.consultation.drugOrdersWithUpdatedOrderAttributes || {};
                $scope.consultation.activeAndScheduledDrugOrders = getActiveDrugOrders(activeDrugOrders);

                mergeActiveAndScheduledWithDiscontinuedOrders();

                $scope.treatmentConfig = treatmentConfig;// $scope.treatmentConfig used only in UI

                var patientWeight = $http.get(Bahmni.Common.Constants.observationsUrl, {
                    params: {
                        concept: Bahmni.Common.Constants.patientWeight,
                        patientUuid: $scope.patient.uuid
                    },
                    withCredentials: true
                });
                patientWeight = patientWeight.then(function (response) {
                    var patientWeightData = response;
                    if (patientWeightData.data[0] && patientWeightData.data[0].valueAsString) {
                        $scope.patientWeight = response.data[0].value;
                    }
                });
            };
            init();
        }]);
