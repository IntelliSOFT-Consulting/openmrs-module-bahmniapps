"use strict";

angular.module("bahmni.registration").constant("DUPLICATE_PATIENT_CONFIG", {
  enabled: true,
  onlyForNewPatients: true, // Only check duplicates for new patient registration, not when editing
  triggerDelay: 1500, // milliseconds to wait after user stops typing
  minimumMatchCriteria: 2, // minimum number of criteria that must match to consider a duplicate
  dateToleranceDays: 365, // number of days difference allowed for birth dates
  fields: ["givenName", "familyName", "gender", "birthdate"], // fields to watch for changes (all required)

  // Advanced configurations
  enableNameSoundex: false, // future enhancement for phonetic matching
  caseSensitiveNames: false,

  // UI configurations
  modalClassName: "ngdialog-theme-default duplicate-patient-modal",
  closeByDocument: false,
  closeByEscape: false,

  // Search configurations
  maxResults: 10, // maximum number of duplicate patients to show
});
