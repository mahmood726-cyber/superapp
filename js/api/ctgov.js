/**
 * ClinicalTrials.gov API v2 client
 * Handles searching, fetching, and pagination with rate limiting
 */

const BASE_URL = 'https://clinicaltrials.gov/api/v2';

const RATE_LIMIT = {
  requestsPerMinute: 10,
  minDelayMs: 6000
};

const DEFAULT_FIELDS = [
  'NCTId',
  'BriefTitle',
  'OfficialTitle',
  'OverallStatus',
  'Phase',
  'StudyType',
  'EnrollmentCount',
  'EnrollmentType',
  'StartDate',
  'PrimaryCompletionDate',
  'CompletionDate',
  'LastUpdatePostDate',
  'HasResults',
  'Condition',
  'InterventionName',
  'InterventionType',
  'PrimaryOutcomeMeasure',
  'SecondaryOutcomeMeasure',
  'LeadSponsorName',
  'LeadSponsorClass',
  'ResponsiblePartyType',
  'ArmGroupLabel',
  'ArmGroupType',
  'WhyStopped',
  'DesignAllocation',
  'DesignMasking'
];

class CTGovAPI {
  constructor() {
    this._lastRequest = 0;
    this._queue = [];
    this._processing = false;
  }

  /**
   * Search for clinical trials
   * @param {Object} params - Search parameters
   * @returns {Promise<Object>}
   */
  async search(params) {
    const {
      condition,
      intervention,
      term,
      studyType = 'INTERVENTIONAL',
      phase = ['PHASE2', 'PHASE3', 'PHASE4'],
      startDate = '2005-01-01',
      status = ['COMPLETED', 'TERMINATED', 'ACTIVE_NOT_RECRUITING'],
      sponsor,
      hasResults,
      pageSize = 100,
      pageToken = null,
      fields = DEFAULT_FIELDS
    } = params;

    // Build query
    const queryParts = [];
    if (condition) queryParts.push(`CONDITION:${this._escapeQuery(condition)}`);
    if (intervention) queryParts.push(`INTERVENTION:${this._escapeQuery(intervention)}`);
    if (term) queryParts.push(this._escapeQuery(term));
    if (sponsor) queryParts.push(`SPONSOR:${this._escapeQuery(sponsor)}`);

    const url = new URL(`${BASE_URL}/studies`);

    if (queryParts.length > 0) {
      url.searchParams.set('query.term', queryParts.join(' AND '));
    }

    // Filters
    if (status && status.length > 0) {
      url.searchParams.set('filter.overallStatus', status.join(','));
    }

    if (studyType) {
      url.searchParams.set('filter.studyType', studyType);
    }

    if (phase && phase.length > 0) {
      url.searchParams.set('filter.phase', phase.join(','));
    }

    if (startDate) {
      url.searchParams.set('filter.advanced', `AREA[StartDate]RANGE[${startDate},MAX]`);
    }

    // Pagination
    url.searchParams.set('pageSize', pageSize);
    url.searchParams.set('countTotal', 'true');

    if (pageToken) {
      url.searchParams.set('pageToken', pageToken);
    }

    // Fields
    url.searchParams.set('fields', fields.join(','));

    const response = await this._fetch(url.toString());

    return {
      studies: this._normalizeStudies(response.studies || []),
      totalCount: response.totalCount || 0,
      nextPageToken: response.nextPageToken || null
    };
  }

  /**
   * Get a single study by NCT ID
   * @param {string} nctId
   * @param {boolean} includeResults
   * @returns {Promise<Object>}
   */
  async getStudy(nctId, includeResults = true) {
    const url = new URL(`${BASE_URL}/studies/${nctId}`);

    if (includeResults) {
      url.searchParams.set('fields', 'ProtocolSection,ResultsSection');
    }

    const response = await this._fetch(url.toString());
    return this._normalizeStudy(response);
  }

  /**
   * Get multiple studies by NCT IDs
   * @param {string[]} nctIds
   * @returns {Promise<Object[]>}
   */
  async getStudies(nctIds) {
    // CT.gov doesn't have a batch endpoint, so we fetch sequentially
    const studies = [];

    for (const nctId of nctIds) {
      try {
        const study = await this.getStudy(nctId);
        studies.push(study);
      } catch (error) {
        console.warn(`Failed to fetch ${nctId}:`, error);
      }
    }

    return studies;
  }

  /**
   * Search and retrieve all results with pagination
   * @param {Object} params
   * @param {Function} onProgress
   * @returns {Promise<Object>}
   */
  async searchAll(params, onProgress = null) {
    const allStudies = [];
    let pageToken = null;
    let totalCount = 0;
    let pageNum = 0;
    const maxPages = 100; // Safety limit

    do {
      const response = await this.search({ ...params, pageToken });

      if (pageNum === 0) {
        totalCount = response.totalCount;
      }

      allStudies.push(...response.studies);
      pageToken = response.nextPageToken;
      pageNum++;

      if (onProgress) {
        onProgress({
          fetched: allStudies.length,
          total: totalCount,
          page: pageNum,
          complete: !pageToken
        });
      }

    } while (pageToken && pageNum < maxPages);

    return {
      studies: allStudies,
      totalCount,
      complete: !pageToken
    };
  }

  /**
   * Fetch with rate limiting and retry
   * @param {string} url
   * @returns {Promise<Object>}
   */
  async _fetch(url) {
    // Rate limiting
    const now = Date.now();
    const timeSinceLast = now - this._lastRequest;

    if (timeSinceLast < RATE_LIMIT.minDelayMs) {
      await this._delay(RATE_LIMIT.minDelayMs - timeSinceLast);
    }

    this._lastRequest = Date.now();

    // Fetch with retry
    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      try {
        const response = await fetch(url, {
          headers: { 'Accept': 'application/json' }
        });

        if (!response.ok) {
          if (response.status === 429) {
            // Rate limited - wait and retry
            console.warn('Rate limited, waiting 30s...');
            await this._delay(30000);
            attempts++;
            continue;
          }
          throw new Error(`CT.gov API error: ${response.status} ${response.statusText}`);
        }

        return response.json();

      } catch (error) {
        attempts++;
        if (attempts >= maxAttempts) throw error;
        console.warn(`Retry ${attempts}/${maxAttempts}:`, error.message);
        await this._delay(1000 * Math.pow(2, attempts));
      }
    }
  }

  /**
   * Normalize study data from API response
   * @param {Object} study
   * @returns {Object}
   */
  _normalizeStudy(study) {
    if (!study) return null;

    const protocol = study.protocolSection || {};
    const identification = protocol.identificationModule || {};
    const status = protocol.statusModule || {};
    const design = protocol.designModule || {};
    const outcomes = protocol.outcomesModule || {};
    const arms = protocol.armsInterventionsModule || {};
    const sponsor = protocol.sponsorCollaboratorsModule || {};
    const conditions = protocol.conditionsModule || {};

    const results = study.resultsSection || null;

    return {
      nctId: identification.nctId,
      briefTitle: identification.briefTitle,
      officialTitle: identification.officialTitle,

      overallStatus: status.overallStatus,
      startDate: status.startDateStruct?.date,
      primaryCompletionDate: status.primaryCompletionDateStruct?.date,
      completionDate: status.completionDateStruct?.date,
      lastUpdatePostDate: status.lastUpdatePostDateStruct?.date,
      whyStopped: status.whyStopped,

      studyType: design.studyType,
      phase: design.phases?.join(', '),
      enrollmentCount: design.enrollmentInfo?.count,
      enrollmentType: design.enrollmentInfo?.type,
      allocation: design.designInfo?.allocation,
      masking: design.designInfo?.maskingInfo?.masking,

      hasResults: !!results,

      conditions: conditions.conditionList || [],
      interventions: (arms.interventionList || []).map(i => ({
        type: i.interventionType,
        name: i.interventionName,
        description: i.interventionDescription
      })),

      armGroups: (arms.armGroupList || []).map(a => ({
        label: a.armGroupLabel,
        type: a.armGroupType,
        description: a.armGroupDescription
      })),

      primaryOutcomes: (outcomes.primaryOutcomeList || []).map(o => ({
        measure: o.primaryOutcomeMeasure,
        description: o.primaryOutcomeDescription,
        timeFrame: o.primaryOutcomeTimeFrame,
        type: 'PRIMARY'
      })),

      secondaryOutcomes: (outcomes.secondaryOutcomeList || []).map(o => ({
        measure: o.secondaryOutcomeMeasure,
        description: o.secondaryOutcomeDescription,
        timeFrame: o.secondaryOutcomeTimeFrame,
        type: 'SECONDARY'
      })),

      leadSponsor: sponsor.leadSponsor?.leadSponsorName,
      sponsorClass: sponsor.leadSponsor?.leadSponsorClass,

      results: results ? this._normalizeResults(results) : null,

      _raw: study
    };
  }

  /**
   * Normalize multiple studies
   * @param {Object[]} studies
   * @returns {Object[]}
   */
  _normalizeStudies(studies) {
    return studies.map(s => this._normalizeStudy(s)).filter(Boolean);
  }

  /**
   * Normalize results section
   * @param {Object} results
   * @returns {Object}
   */
  _normalizeResults(results) {
    const participant = results.participantFlowModule || {};
    const baseline = results.baselineCharacteristicsModule || {};
    const outcomes = results.outcomeMeasuresModule || {};
    const adverse = results.adverseEventsModule || {};

    return {
      participantFlow: {
        groups: participant.flowGroupList || [],
        periods: participant.flowPeriodList || []
      },

      baseline: {
        groups: baseline.baselineGroupList || [],
        measures: baseline.baselineMeasureList || []
      },

      outcomes: (outcomes.outcomeMeasureList || []).map(o => ({
        id: o.outcomeMeasureId,
        type: o.outcomeMeasureType,
        title: o.outcomeMeasureTitle,
        description: o.outcomeMeasureDescription,
        timeFrame: o.outcomeMeasureTimeFrame,
        unitOfMeasure: o.outcomeMeasureUnitOfMeasure,
        paramType: o.outcomeMeasureParamType,
        dispersionType: o.outcomeMeasureDispersionType,
        groups: o.outcomeMeasureGroupList || [],
        classes: (o.outcomeMeasureClassList || []).map(c => ({
          title: c.outcomeMeasureClassTitle,
          categories: (c.outcomeMeasureCategoryList || []).map(cat => ({
            title: cat.outcomeMeasureCategoryTitle,
            measurements: cat.outcomeMeasurementList || []
          }))
        }))
      })),

      adverseEvents: {
        frequency: adverse.adverseEventsFrequencyThreshold,
        groups: adverse.adverseEventsGroupList || [],
        serious: adverse.seriousEventList || [],
        other: adverse.otherEventList || []
      }
    };
  }

  /**
   * Escape special characters in query
   * @param {string} query
   * @returns {string}
   */
  _escapeQuery(query) {
    return query.replace(/[+\-&|!(){}[\]^"~*?:\\]/g, '\\$&');
  }

  /**
   * Delay helper
   * @param {number} ms
   * @returns {Promise<void>}
   */
  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Singleton instance
export const ctgovAPI = new CTGovAPI();

export default ctgovAPI;
