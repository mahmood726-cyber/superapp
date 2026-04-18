/**
 * Search Worker
 * Living Meta-Analysis Platform
 *
 * Background worker for CT.gov API searches
 * Handles pagination, rate limiting, and result aggregation
 */

const API_BASE = 'https://clinicaltrials.gov/api/v2';
const PAGE_SIZE = 100;
const MIN_DELAY = 6000; // 6 seconds between requests (10 req/min limit)

let isSearching = false;
let shouldCancel = false;

/**
 * Build CT.gov API query from search parameters
 */
function buildQuery(params) {
  const queryParts = [];

  if (params.condition) {
    queryParts.push(`AREA[Condition]${params.condition}`);
  }

  if (params.intervention) {
    queryParts.push(`AREA[Intervention]${params.intervention}`);
  }

  if (params.studyType) {
    queryParts.push(`AREA[StudyType]${params.studyType}`);
  }

  if (params.phase && params.phase.length > 0) {
    queryParts.push(`AREA[Phase](${params.phase.join(' OR ')})`);
  }

  if (params.status && params.status.length > 0) {
    queryParts.push(`AREA[OverallStatus](${params.status.join(' OR ')})`);
  }

  if (params.startDate) {
    const endDate = params.endDate || 'MAX';
    queryParts.push(`AREA[StartDate]RANGE[${params.startDate},${endDate}]`);
  }

  if (params.country) {
    queryParts.push(`AREA[LocationCountry]${params.country}`);
  }

  if (params.hasResults === 'true') {
    queryParts.push('AREA[ResultsFirstSubmitDate]RANGE[MIN,MAX]');
  } else if (params.hasResults === 'false') {
    queryParts.push('NOT AREA[ResultsFirstSubmitDate]RANGE[MIN,MAX]');
  }

  if (params.minEnrollment && parseInt(params.minEnrollment) > 0) {
    queryParts.push(`AREA[EnrollmentCount]RANGE[${params.minEnrollment},MAX]`);
  }

  return queryParts.join(' AND ');
}

/**
 * Normalize study data from API response
 */
function normalizeStudy(study) {
  const protocol = study.protocolSection || {};
  const identification = protocol.identificationModule || {};
  const status = protocol.statusModule || {};
  const design = protocol.designModule || {};
  const description = protocol.descriptionModule || {};
  const conditions = protocol.conditionsModule || {};
  const interventions = protocol.armsInterventionsModule || {};
  const outcomes = protocol.outcomesModule || {};
  const eligibility = protocol.eligibilityModule || {};
  const contacts = protocol.contactsLocationsModule || {};
  const sponsors = protocol.sponsorCollaboratorsModule || {};
  const results = study.resultsSection || {};

  return {
    nctId: identification.nctId,
    orgStudyId: identification.orgStudyIdInfo?.id,
    title: identification.briefTitle,
    officialTitle: identification.officialTitle,
    acronym: identification.acronym,

    status: status.overallStatus,
    statusVerifiedDate: status.statusVerifiedDate,
    startDate: status.startDateStruct?.date,
    completionDate: status.completionDateStruct?.date,
    primaryCompletionDate: status.primaryCompletionDateStruct?.date,

    studyType: design.studyType,
    phases: design.phases || [],
    enrollment: design.enrollmentInfo?.count,
    enrollmentType: design.enrollmentInfo?.type,
    allocation: design.designInfo?.allocation,
    interventionModel: design.designInfo?.interventionModel,
    masking: design.designInfo?.maskingInfo?.masking,

    briefSummary: description.briefSummary,
    detailedDescription: description.detailedDescription,

    conditions: conditions.conditions || [],
    keywords: conditions.keywords || [],

    interventionsList: (interventions.interventions || []).map(i => ({
      type: i.type,
      name: i.name,
      description: i.description
    })),

    arms: (interventions.armGroups || []).map(a => ({
      label: a.label,
      type: a.type,
      description: a.description
    })),

    primaryOutcomes: (outcomes.primaryOutcomes || []).map(o => ({
      measure: o.measure,
      timeFrame: o.timeFrame,
      description: o.description
    })),

    secondaryOutcomes: (outcomes.secondaryOutcomes || []).map(o => ({
      measure: o.measure,
      timeFrame: o.timeFrame,
      description: o.description
    })),

    eligibilityCriteria: eligibility.eligibilityCriteria,
    sex: eligibility.sex,
    minAge: eligibility.minimumAge,
    maxAge: eligibility.maximumAge,
    healthyVolunteers: eligibility.healthyVolunteers,

    leadSponsor: sponsors.leadSponsor ? {
      name: sponsors.leadSponsor.name,
      class: sponsors.leadSponsor.class
    } : null,

    collaborators: (sponsors.collaborators || []).map(c => ({
      name: c.name,
      class: c.class
    })),

    locations: (contacts.locations || []).slice(0, 10).map(l => ({
      facility: l.facility,
      city: l.city,
      state: l.state,
      country: l.country
    })),

    hasResults: !!results.participantFlowModule,
    resultsFirstSubmitDate: status.resultsFirstSubmitDate,

    // Raw data for detailed extraction
    _raw: study
  };
}

/**
 * Fetch a single page of results
 */
async function fetchPage(query, pageToken = null) {
  const params = new URLSearchParams({
    format: 'json',
    pageSize: PAGE_SIZE.toString(),
    'query.term': query,
    fields: [
      'NCTId',
      'OrgStudyId',
      'BriefTitle',
      'OfficialTitle',
      'Acronym',
      'OverallStatus',
      'StatusVerifiedDate',
      'StartDate',
      'CompletionDate',
      'PrimaryCompletionDate',
      'StudyType',
      'Phase',
      'EnrollmentCount',
      'EnrollmentType',
      'DesignAllocation',
      'DesignInterventionModel',
      'DesignMasking',
      'BriefSummary',
      'Condition',
      'Keyword',
      'InterventionType',
      'InterventionName',
      'ArmGroupLabel',
      'ArmGroupType',
      'PrimaryOutcomeMeasure',
      'SecondaryOutcomeMeasure',
      'EligibilityCriteria',
      'Gender',
      'MinimumAge',
      'MaximumAge',
      'LeadSponsorName',
      'LeadSponsorClass',
      'LocationFacility',
      'LocationCity',
      'LocationCountry',
      'ResultsFirstSubmitDate'
    ].join('|')
  });

  if (pageToken) {
    params.set('pageToken', pageToken);
  }

  const response = await fetch(`${API_BASE}/studies?${params}`);

  if (!response.ok) {
    if (response.status === 429) {
      throw new Error('RATE_LIMITED');
    }
    throw new Error(`API error: ${response.status}`);
  }

  return response.json();
}

/**
 * Perform full search with pagination
 */
async function performSearch(params, searchId) {
  const query = buildQuery(params);

  if (!query) {
    self.postMessage({
      type: 'error',
      searchId,
      error: 'No search criteria provided'
    });
    return;
  }

  isSearching = true;
  shouldCancel = false;

  const allStudies = [];
  let pageToken = null;
  let pageNum = 0;
  let totalCount = 0;

  self.postMessage({
    type: 'started',
    searchId,
    query
  });

  try {
    do {
      if (shouldCancel) {
        self.postMessage({
          type: 'cancelled',
          searchId,
          studies: allStudies,
          totalFound: totalCount
        });
        break;
      }

      pageNum++;

      self.postMessage({
        type: 'progress',
        searchId,
        page: pageNum,
        fetched: allStudies.length,
        totalCount
      });

      // Add delay between requests (except first)
      if (pageNum > 1) {
        await new Promise(resolve => setTimeout(resolve, MIN_DELAY));
      }

      let data;
      let retries = 0;
      const maxRetries = 3;

      while (retries < maxRetries) {
        try {
          data = await fetchPage(query, pageToken);
          break;
        } catch (err) {
          if (err.message === 'RATE_LIMITED') {
            retries++;
            if (retries >= maxRetries) {
              throw new Error('Rate limited after multiple retries');
            }
            // Wait longer on rate limit
            await new Promise(resolve => setTimeout(resolve, MIN_DELAY * 2));
          } else {
            throw err;
          }
        }
      }

      // Update total count from first response
      if (pageNum === 1 && data.totalCount !== undefined) {
        totalCount = data.totalCount;
        self.postMessage({
          type: 'count',
          searchId,
          totalCount
        });
      }

      // Normalize and collect studies
      const studies = (data.studies || []).map(normalizeStudy);
      allStudies.push(...studies);

      // Get next page token
      pageToken = data.nextPageToken || null;

      // Send batch update
      self.postMessage({
        type: 'batch',
        searchId,
        studies,
        page: pageNum,
        fetched: allStudies.length,
        totalCount,
        hasMore: !!pageToken
      });

    } while (pageToken);

    if (!shouldCancel) {
      self.postMessage({
        type: 'complete',
        searchId,
        studies: allStudies,
        totalCount: totalCount || allStudies.length,
        query
      });
    }

  } catch (error) {
    self.postMessage({
      type: 'error',
      searchId,
      error: error.message,
      partialResults: allStudies
    });
  } finally {
    isSearching = false;
  }
}

/**
 * Check for new studies since last search
 */
async function checkForUpdates(params, lastSearchDate, searchId) {
  // Modify params to only get studies updated since last search
  const updatedParams = {
    ...params,
    // CT.gov doesn't have a direct "updated since" filter,
    // so we'll search and compare NCT IDs
  };

  // Perform a quick count-only search first
  const query = buildQuery(updatedParams);

  try {
    const data = await fetchPage(query);
    const currentCount = data.totalCount || 0;

    self.postMessage({
      type: 'update-check',
      searchId,
      currentCount,
      lastSearchDate
    });

  } catch (error) {
    self.postMessage({
      type: 'error',
      searchId,
      error: error.message
    });
  }
}

/**
 * Compare two result sets and find differences
 */
function compareResults(oldResults, newResults) {
  const oldIds = new Set(oldResults.map(r => r.nctId));
  const newIds = new Set(newResults.map(r => r.nctId));

  const added = newResults.filter(r => !oldIds.has(r.nctId));
  const removed = oldResults.filter(r => !newIds.has(r.nctId));

  // Check for status changes
  const statusChanges = [];
  const oldMap = new Map(oldResults.map(r => [r.nctId, r]));

  for (const newStudy of newResults) {
    const oldStudy = oldMap.get(newStudy.nctId);
    if (oldStudy && oldStudy.status !== newStudy.status) {
      statusChanges.push({
        nctId: newStudy.nctId,
        oldStatus: oldStudy.status,
        newStatus: newStudy.status
      });
    }
    // Check for new results posted
    if (oldStudy && !oldStudy.hasResults && newStudy.hasResults) {
      statusChanges.push({
        nctId: newStudy.nctId,
        type: 'results_posted'
      });
    }
  }

  return { added, removed, statusChanges };
}

// Handle messages from main thread
self.onmessage = async function(event) {
  const { type, payload, searchId } = event.data;

  switch (type) {
    case 'search':
      if (isSearching) {
        self.postMessage({
          type: 'error',
          searchId,
          error: 'Search already in progress'
        });
        return;
      }
      await performSearch(payload.params, searchId);
      break;

    case 'cancel':
      shouldCancel = true;
      break;

    case 'check-updates':
      await checkForUpdates(payload.params, payload.lastSearchDate, searchId);
      break;

    case 'compare':
      const diff = compareResults(payload.oldResults, payload.newResults);
      self.postMessage({
        type: 'diff',
        searchId,
        diff
      });
      break;

    default:
      self.postMessage({
        type: 'error',
        searchId,
        error: `Unknown message type: ${type}`
      });
  }
};

console.log('[SearchWorker] Initialized');
