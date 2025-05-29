"use strict";

angular.module("bahmni.registration").factory("duplicatePatientService", [
  "$http",
  "$q",
  "patientService",
  "sessionService",
  "DUPLICATE_PATIENT_CONFIG",
  function ($http, $q, patientService, sessionService, DUPLICATE_PATIENT_CONFIG) {
    var searchForDuplicates = function (patient) {
      if (
        !DUPLICATE_PATIENT_CONFIG.enabled ||
        !patient ||
        !patient.givenName ||
        !patient.familyName ||
        !patient.gender ||
        !patient.birthdate
      ) {
        return $q.resolve([]);
      }

      // Build search criteria
      var searchCriteria = {
        givenName: DUPLICATE_PATIENT_CONFIG.caseSensitiveNames
          ? patient.givenName.trim()
          : patient.givenName.toLowerCase().trim(),
        familyName: patient.familyName
          ? DUPLICATE_PATIENT_CONFIG.caseSensitiveNames
            ? patient.familyName.trim()
            : patient.familyName.toLowerCase().trim()
          : "",
        gender: patient.gender,
        birthdate: patient.birthdate,
      };

      // Use the existing patient search with enhanced criteria
      var searchQuery = searchCriteria.givenName;
      if (searchCriteria.familyName) {
        searchQuery += " " + searchCriteria.familyName;
      }

      return patientService
        .search(
          searchQuery,
          undefined, // identifier
          undefined, // addressFieldName
          undefined, // addressFieldValue
          undefined, // customAttributeValue
          0, // offset
          undefined, // customAttributeFields
          undefined, // programAttributeFieldName
          undefined, // programAttributeFieldValue
          undefined, // addressSearchResultsConfig
          undefined // patientSearchResultsConfig
        )
        .then(function (response) {
          if (!response || !response.pageOfResults) {
            return [];
          }

          // Filter results for potential duplicates
          var duplicates = filterPotentialDuplicates(response.pageOfResults, searchCriteria);

          // Limit results based on configuration
          return duplicates.slice(0, DUPLICATE_PATIENT_CONFIG.maxResults);
        });
    };

    var filterPotentialDuplicates = function (patients, criteria) {
      return patients.filter(function (patient) {
        // Check name similarity
        var nameMatch = checkNameSimilarity(patient, criteria);

        // Check gender match
        var genderMatch = patient.gender === criteria.gender;

        // Check birth date similarity (within reasonable range)
        var dateMatch = checkDateSimilarity(patient.birthdate, criteria.birthdate);

        // Consider it a potential duplicate if at least the configured number of criteria match
        var matchCount = (nameMatch ? 1 : 0) + (genderMatch ? 1 : 0) + (dateMatch ? 1 : 0);
        return matchCount >= DUPLICATE_PATIENT_CONFIG.minimumMatchCriteria;
      });
    };

    var checkNameSimilarity = function (patient, criteria) {
      var patientGivenName = (patient.givenName || "").toLowerCase().trim();
      var patientFamilyName = (patient.familyName || "").toLowerCase().trim();

      // Check for exact or partial matches
      var givenNameMatch = patientGivenName.includes(criteria.givenName) || criteria.givenName.includes(patientGivenName);

      var familyNameMatch = true; // Default to true if no family name provided
      if (criteria.familyName && patientFamilyName) {
        familyNameMatch = patientFamilyName.includes(criteria.familyName) || criteria.familyName.includes(patientFamilyName);
      }

      return givenNameMatch && familyNameMatch;
    };

    var checkDateSimilarity = function (patientBirthdate, criteriaBirthdate) {
      if (!patientBirthdate || !criteriaBirthdate) {
        return false;
      }

      var patientDate = moment(patientBirthdate);
      var criteriaDate = moment(criteriaBirthdate);

      // Check if dates are within the configured tolerance
      return Math.abs(patientDate.diff(criteriaDate, "days")) <= DUPLICATE_PATIENT_CONFIG.dateToleranceDays;
    };

    return {
      searchForDuplicates: searchForDuplicates,
    };
  },
]);
