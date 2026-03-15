'use strict';

angular.module('bahmni.clinical')
    .controller('ConceptSetPageController', ['$scope', '$rootScope', '$stateParams', 'conceptSetService',
        'clinicalAppConfigService', 'messagingService', 'configurations', '$state', 'spinner',
        'contextChangeHandler', '$q', '$translate', 'formService', '$location',
        function ($scope, $rootScope, $stateParams, conceptSetService,
            clinicalAppConfigService, messagingService, configurations, $state, spinner,
            contextChangeHandler, $q, $translate, formService, $location) {
            $scope.consultation.selectedObsTemplate = $scope.consultation.selectedObsTemplate || [];
            $scope.allTemplates = $scope.allTemplates || [];
            $scope.scrollingEnabled = false;
            var extensions = clinicalAppConfigService.getAllConceptSetExtensions($stateParams.conceptSetGroupName);
            var configs = clinicalAppConfigService.getAllConceptsConfig();
            var visitType = configurations.encounterConfig().getVisitTypeByUuid($scope.consultation.visitTypeUuid);
            $scope.context = { visitType: visitType, patient: $scope.patient };
            var numberOfLevels = 2;
            var fields = ['uuid', 'name:(name,display)', 'names:(uuid,conceptNameType,name)'];
            var customRepresentation = Bahmni.ConceptSet.CustomRepresentationBuilder.build(fields, 'setMembers', numberOfLevels);
            var allConceptSections = [];

            var init = function () {
                if (!($scope.allTemplates !== undefined && $scope.allTemplates.length > 0)) {
                    spinner.forPromise(conceptSetService.getConcept({
                        name: "All Observation Templates",
                        v: "custom:" + customRepresentation
                    }).then(function (response) {
                        var allTemplates = response.data.results[0].setMembers;
                        createConceptSections(allTemplates);
                        if ($state.params.programUuid) {
                            showOnlyTemplatesFilledInProgram();
                        }

                        // Retrieve Form Details
                        if (!($scope.consultation.observationForms !== undefined && $scope.consultation.observationForms.length > 0)) {
                            spinner.forPromise(formService.getFormList($scope.consultation.encounterUuid)
                                .then(function (response) {
                                    $scope.consultation.observationForms = getObservationForms(response.data);
                                    concatObservationForms();
                                })
                            );
                        } else {
                            concatObservationForms();
                        }
                    }));
                }
            };
            var concatObservationForms = function () {
                $scope.allTemplates = getSelectedObsTemplate(allConceptSections);
                $scope.uniqueTemplates = _.uniqBy($scope.allTemplates, 'label');
                $scope.allTemplates = $scope.allTemplates.concat($scope.consultation.observationForms);

                // --- LOG HERE ---
                console.log("--- ALL AVAILABLE TEMPLATES (Concept Sets + Form 2.0) ---");
                console.log($scope.allTemplates);

                // To see just the names/labels for easy reading:
                console.log("Template Labels:", _.map($scope.allTemplates, 'label'));

                // --- READ FROM SESSION STORAGE ---
                // We use the key we defined in ConsultationController
                var currentQueue = sessionStorage.getItem('bahmni_current_queue');

                console.log("Queue detected from SessionStorage in CS:", currentQueue);

                // --- APPLY FILTER LOGIC ---
                // --- DYNAMIC FILTER LOGIC ---
                // --- READ FROM SESSION STORAGE ---
                var currentQueue = sessionStorage.getItem('bahmni_current_queue');
                var queueUpper = currentQueue ? currentQueue.toUpperCase() : "";

                console.log("Queue detected from SessionStorage:", queueUpper);

                // --- DYNAMIC FILTER LOGIC ---
                if (queueUpper === "EMERGENCY") {
                    $scope.allTemplates = _.filter($scope.allTemplates, function (template) {
                        var name = template.label || template.formName;
                        return name === "Emergency";
                    });
                }
                else if (queueUpper === "OPDONE" || queueUpper === "OPDTWO") {
                    console.log("Filtering for OPD 1 & 2 queues...");
                    $scope.allTemplates = _.filter($scope.allTemplates, function (template) {
                        var name = template.label || template.formName;
                        return name === "Comprehensive Ophthalmic Examinations" ||
                            name === "Opthalmologist Consultation" || name === "Tear Film Evaluation" ||
                            name === "Tests of Ocular Moility and Binocular Vision" || name === "Ptosis Evaluation" ||
                            name === "Special Ophthalmic Examination";
                    });
                }
                else if (queueUpper === "PHARMACY") {
                    $scope.allTemplates = _.filter($scope.allTemplates, function (template) {
                        var name = template.label || template.formName;
                        return name === "Dispensing Form";
                    });
                }
                else if (queueUpper === "OPTICAL") {
                    $scope.allTemplates = _.filter($scope.allTemplates, function (template) {
                        var name = template.label || template.formName;
                        return name === "Optical Prescription";
                    });
                }
                else if (queueUpper === "LAB") {
                    $scope.allTemplates = _.filter($scope.allTemplates, function (template) {
                        var name = template.label || template.formName;
                        return name === "Lab Results Entry";
                    });
                }
                else if (queueUpper === "MINOR_OR") {
                    $scope.allTemplates = _.filter($scope.allTemplates, function (template) {
                        var name = template.label || template.formName;
                        return name === "Minor Operation Note";
                    });
                }
                else if (queueUpper === "COUNSELLING") {
                    $scope.allTemplates = _.filter($scope.allTemplates, function (template) {
                        var name = template.label || template.formName;
                        return name === "Pre Operative Record (Cataract Surgery)" || name === "Counselling Form"
                            || name === "Ophthalmic Investigation Counseling Checklist";
                    });
                }
                else if (queueUpper === "DIAGNOSTIC") {
                    $scope.allTemplates = _.filter($scope.allTemplates, function (template) {
                        var name = template.label || template.formName;
                        return name === "Color Vision Test" || name === "Amsler Grid Test"
                            || name === "Ophthalmic Investigation Counseling Checklist";
                    });
                }
                else if (queueUpper === "OT") {
                    $scope.allTemplates = _.filter($scope.allTemplates, function (template) {
                        var name = template.label || template.formName;
                        return name === "Before Anesthesia" || name === "Before Surgery Checklist"
                            || name === "Cataract Surgery" || name === "Cataract Surgery Operating Theatre" || name === "Surgery Preparation Checklist"
                            || name === "Surgical Incision Checklist" || name == "Surgical Preop Checklist" || name === "Surgical Block Room Checklist After Anesthesia"
                            || name === "Surgical Post Operative Checklist";
                    });
                }
                else if (queueUpper === "CATARACT") {
                    $scope.allTemplates = _.filter($scope.allTemplates, function (template) {
                        var name = template.label || template.formName;
                        return name === "Cataract Surgery Inpatient Form" || name === "Cataract Surgery Inpatient Form"
                            || name === "Cataract Surgery One Month Follow Up" || name === "Cataract Surgery One Week Follow Up" || name === "Cataract Surgery Progress Sheet"
                            || name === "Cataract Surgery Refraction Record";
                    });
                    // Refresh uniqueTemplates so the UI list updates
                    $scope.uniqueTemplates = _.uniqBy($scope.allTemplates, 'label');


                    

                    // Counselling Checklist
                    // Gonioscopy Evaluation
                    // Laser Procedure Note
                    // OPD Procedure Note
                    // Ophthalmic Investigation Counseling Checklist - Done
                    // Preanaesthesia Form
                    // Preliminary Surgery Tests
                    // Proptosis Evaluation 
                    // Special Ophthalmic Investigation
                    // Surgery Inpatient Form
                    // Surgical Counselling Checklist
                    // Surgical Operating Room After Incision Checklist

                    // Cataract Surgery First Day Postoperative Followup - Done
                    // Cataract Surgery Inpatient Form - Done
                    // Cataract Surgery One Month Follow Up - Done
                    // Cataract Surgery One Week Follow Up  - Done
                    // Cataract Surgery Progress Sheet  - Done
                    // Cataract Surgery Refraction Record - Done
                    // Pre Operative Record (Cataract Surgery) - Done
                    // Cataract Surgery Operating Theatre - Done
                    // Before Anesthesia  - Done
                    // Before Surgery Checklist - Done
                    // Cataract Surgery - Done
                    // Surgery Preparation Checklist - Done
                    // Surgical Block Room Checklist After Anesthesia - Done
                    // Surgical Incision Checklist - Done
                    // Surgical Post Operative Checklist - Done
                    // Surgical Preop Checklist - Done
                    // Tear Film Evaluation - Done
                    // Tests of Ocular Moility and Binocular Vision - Done
                    // Ptosis Evaluation - Done
                    // Amsler Grid Test - Done
                    // Emergency - Done
                    // Comprehensive Ophthalmic Examinations - Done
                    // Color Vision Test - Done
                    // Opthalmologist Consultation - Done
                    // Counselling Form - Done
                    // Special Ophthalmic Examination - Done
                    // Minor Operation Note - Done

                    if ($scope.consultation.selectedObsTemplate.length == 0) {
                        initializeDefaultTemplates();
                        if ($scope.consultation.observations && $scope.consultation.observations.length > 0) {
                            addTemplatesInSavedOrder();
                        }
                        var templateToBeOpened = getLastVisitedTemplate() ||
                            _.first($scope.consultation.selectedObsTemplate);

                        if (templateToBeOpened) {
                            openTemplate(templateToBeOpened);
                        }
                    }
                };

                var addTemplatesInSavedOrder = function () {
                    var templatePreference = JSON.parse(localStorage.getItem("templatePreference"));
                    if (templatePreference && templatePreference.patientUuid === $scope.patient.uuid &&
                        !_.isEmpty(templatePreference.templates) && $rootScope.currentProvider.uuid === templatePreference.providerUuid) {
                        insertInSavedOrder(templatePreference);
                    } else {
                        insertInDefaultOrder();
                    }
                };

                var insertInSavedOrder = function (templatePreference) {
                    var templateNames = templatePreference.templates;
                    _.each(templateNames, function (templateName) {
                        var foundTemplates = _.filter($scope.allTemplates, function (allTemplate) {
                            return allTemplate.conceptName === templateName;
                        });
                        if (foundTemplates.length > 0) {
                            _.each(foundTemplates, function (template) {
                                if (!_.isEmpty(template.observations)) {
                                    insertTemplate(template);
                                }
                            });
                        }
                    });
                };

                var insertInDefaultOrder = function () {
                    _.each($scope.allTemplates, function (template) {
                        if (template.observations.length > 0) {
                            insertTemplate(template);
                        }
                    });
                };

                var insertTemplate = function (template) {
                    if (template && !(template.isDefault() || template.alwaysShow)) {
                        $scope.consultation.selectedObsTemplate.push(template);
                    }
                };

                var getLastVisitedTemplate = function () {
                    return _.find($scope.consultation.selectedObsTemplate, function (template) {
                        return template.id === $scope.consultation.lastvisited;
                    });
                };

                var openTemplate = function (template) {
                    template.isOpen = true;
                    template.isLoaded = true;
                    template.klass = "active";
                };

                var initializeDefaultTemplates = function () {
                    $scope.consultation.selectedObsTemplate = _.filter($scope.allTemplates, function (template) {
                        return template.isDefault() || template.alwaysShow;
                    });
                };

                $scope.filterTemplates = function () {
                    $scope.uniqueTemplates = _.uniqBy($scope.allTemplates, 'label');
                    if ($scope.consultation.searchParameter) {
                        $scope.uniqueTemplates = _.filter($scope.uniqueTemplates, function (template) {
                            return _.includes(template.label.toLowerCase(), $scope.consultation.searchParameter.toLowerCase());
                        });
                    }
                    return $scope.uniqueTemplates;
                };

                var showOnlyTemplatesFilledInProgram = function () {
                    spinner.forPromise(conceptSetService.getObsTemplatesForProgram($state.params.programUuid).success(function (data) {
                        if (data.results.length > 0 && data.results[0].mappings.length > 0) {
                            _.map(allConceptSections, function (conceptSection) {
                                conceptSection.isAdded = false;
                                conceptSection.alwaysShow = false;
                            });

                            _.map(data.results[0].mappings, function (template) {
                                var matchedTemplate = _.find(allConceptSections, { uuid: template.uuid });
                                if (matchedTemplate) {
                                    matchedTemplate.alwaysShow = true;
                                }
                            });
                        }
                    }));
                };

                var createConceptSections = function (allTemplates) {
                    _.map(allTemplates, function (template) {
                        var conceptSetExtension = _.find(extensions, function (extension) {
                            return extension.extensionParams.conceptName === template.name.name;
                        }) || {};
                        var conceptSetConfig = configs[template.name.name] || {};
                        var observationsForTemplate = getObservationsForTemplate(template);
                        if (observationsForTemplate && observationsForTemplate.length > 0) {
                            _.each(observationsForTemplate, function (observation) {
                                allConceptSections.push(new Bahmni.ConceptSet.ConceptSetSection(conceptSetExtension, $rootScope.currentUser, conceptSetConfig, [observation], template));
                            });
                        } else {
                            allConceptSections.push(new Bahmni.ConceptSet.ConceptSetSection(conceptSetExtension, $rootScope.currentUser, conceptSetConfig, [], template));
                        }
                    });
                };

                var collectObservationsFromConceptSets = function () {
                    $scope.consultation.observations = [];
                    _.each($scope.consultation.selectedObsTemplate, function (conceptSetSection) {
                        if (conceptSetSection.observations[0]) {
                            $scope.consultation.observations.push(conceptSetSection.observations[0]);
                        }
                    });
                };

                var getObservationsForTemplate = function (template) {
                    return _.filter($scope.consultation.observations, function (observation) {
                        return !observation.formFieldPath && observation.concept.uuid === template.uuid;
                    });
                };

                var getSelectedObsTemplate = function (allConceptSections) {
                    return allConceptSections.filter(function (conceptSet) {
                        if (conceptSet.isAvailable($scope.context)) {
                            return true;
                        }
                    });
                };

                $scope.stopAutoClose = function ($event) {
                    $event.stopPropagation();
                };

                $scope.addTemplate = function (template) {
                    console.log("This has been clicked!!!")
                    $scope.scrollingEnabled = true;
                    $scope.showTemplatesList = false;
                    var index = _.findLastIndex($scope.consultation.selectedObsTemplate, function (consultationTemplate) {
                        return consultationTemplate.label == template.label;
                    });

                    if (index != -1 && $scope.consultation.selectedObsTemplate[index].allowAddMore) {
                        var clonedObj = template.clone();
                        clonedObj.klass = "active";
                        $scope.consultation.selectedObsTemplate.splice(index + 1, 0, clonedObj);
                    } else {
                        template.toggle();
                        template.klass = "active";
                        if (index > -1) {
                            $scope.consultation.selectedObsTemplate[index] = template;
                        } else {
                            $scope.consultation.selectedObsTemplate.push(template);
                        }
                    }
                    $scope.consultation.searchParameter = "";
                    messagingService.showMessage("info", $translate.instant("CLINICAL_TEMPLATE_ADDED_SUCCESS_KEY", { label: template.label }));
                };

                $scope.getNormalized = function (conceptName) {
                    return conceptName.replace(/['\.\s\(\)\/,\\]+/g, "_");
                };

                $scope.consultation.preSaveHandler.register("collectObservationsFromConceptSets", collectObservationsFromConceptSets);
                // Form Code :: Start
                var getObservationForms = function (observationsForms) {
                    var forms = [];
                    var observations = $scope.consultation.observations || [];
                    _.each(observationsForms, function (observationForm) {
                        var extension = _.find(extensions, function (ext) {
                            return (ext.extensionParams.formName && (observationForm.formName === ext.extensionParams.formName || observationForm.name === ext.extensionParams.formName));
                        }) || {};
                        var formUuid = observationForm.formUuid || observationForm.uuid;
                        var formName = observationForm.name || observationForm.formName;
                        var formVersion = observationForm.version || observationForm.formVersion;
                        var privileges = observationForm.privileges;
                        var labels = observationForm.nameTranslation ? JSON.parse(observationForm.nameTranslation) : [];
                        var label = formName;
                        if (labels.length > 0) {
                            var locale = localStorage.getItem("NG_TRANSLATE_LANG_KEY") || "en";
                            var currentLabel = labels.find(function (label) {
                                return label.locale === locale;
                            });
                            if (currentLabel) { label = currentLabel.display; }
                        }
                        if ($scope.isFormEditableByTheUser(observationForm)) {
                            var newForm = new Bahmni.ObservationForm(formUuid, $rootScope.currentUser,
                                formName, formVersion, observations, label, extension);
                            newForm.privileges = privileges;
                            forms.push(newForm);
                        }
                    });

                    return forms;
                };
                $scope.isFormEditableByTheUser = function (form) {
                    var result = false;
                    if ((typeof form.privileges != 'undefined') && (form.privileges != null) && (form.privileges.length != 0)) {
                        form.privileges.forEach(function (formPrivilege) {
                            _.find($rootScope.currentUser.privileges, function (privilege) {
                                if (formPrivilege.privilegeName === privilege.name) {
                                    if (formPrivilege.editable) {
                                        result = formPrivilege.editable;
                                    } else {
                                        if (formPrivilege.viewable) {
                                            result = true;
                                        }
                                    }
                                }
                            });
                        });
                    } else { result = true; }
                    return result;
                };

                // Form Code :: End
                init();
            }]);
