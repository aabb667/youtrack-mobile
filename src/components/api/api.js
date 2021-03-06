/* @flow */
import qs from 'qs';
import fields from './api__fields';
import Auth from '../auth/auth';
import log from '../log/log';
import {handleEmbeddedHubUrl} from '../config/config';

const STATUS_UNAUTHORIZED = 401;
const STATUS_OK_IF_MORE_THAN = 200;
const STATUS_BAD_IF_MORE_THATN = 300;

class Api {
  auth: Auth;
  config: AppConfigFilled;
  youTrackUrl: string;
  youTrackIssueUrl: string;
  youTrackProjectUrl: string;
  youTrackIssuesFolderUrl: string;
  youtTrackFieldBundleUrl: string;

  constructor(auth: Object) {
    this.auth = auth;
    this.config = auth.config;

    this.youTrackUrl = this.config.backendUrl;
    this.youTrackIssueUrl = `${this.youTrackUrl}/api/issues`;
    this.youTrackProjectUrl =`${this.youTrackUrl}/api/admin/projects`;
    this.youTrackIssuesFolderUrl = `${this.youTrackUrl}/api/issueFolders`;

    this.youtTrackFieldBundleUrl = `${this.youTrackUrl}/api/admin/customFieldSettings/bundles`;
  }

  async makeAuthorizedRequest(url: string, method: ?string, body: ?Object) {
    const sendRequest = async () => {
      const authParams = this.auth.authParams;
      if (!authParams) {
        throw new Error('Using API with uninitializard Auth');
      }

      return await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/plain, */*',
          'Authorization': `${authParams.token_type} ${authParams.access_token}`
        },
        body: JSON.stringify(body)
      });
    };

    let res = await sendRequest();

    if (res.status === STATUS_UNAUTHORIZED) {
      log.info('Looks like the token is expired, will try to refresh', res);
      await this.auth.refreshToken();
      res = await sendRequest();
    }

    if (res.status < STATUS_OK_IF_MORE_THAN || res.status >= STATUS_BAD_IF_MORE_THATN) {
      throw res;
    }

    return await res.json();
  }

  async hackishGetIssueByIssueReadableId(issueId: string) {
    const queryString = qs.stringify({
      query: `issue id: ${issueId}`,
      $top: 1,
      fields: fields.singleIssue.toString()
    });

    const issues = await this.makeAuthorizedRequest(`${this.youTrackIssueUrl}?${queryString}`);
    return issues[0];
  }

  async getIssue(id: string) {
    const queryString = qs.stringify({
      fields: fields.singleIssue.toString()
    });

    const issue = await this.makeAuthorizedRequest(`${this.youTrackIssueUrl}/${id}?${queryString}`);

    issue.comments.forEach(comment => {
      comment.author.avatarUrl = handleEmbeddedHubUrl(comment.author.avatarUrl, this.config.backendUrl);
    });

    return issue;
  }

  async getIssues(query: string = '', $top: number, $skip: number = 0) {
    const queryString = qs.stringify({
      query, $top, $skip,
      fields: fields.issuesOnList.toString()
    });

    return await this.makeAuthorizedRequest(`${this.youTrackIssueUrl}?${queryString}`);
  }

  async getIssueFolders() {
    return await this.makeAuthorizedRequest(`${this.youTrackIssuesFolderUrl}?fields=$type,name,query`);
  }

  async createIssue(issueDraft: IssueOnList) {
    log.info('Issue draft to create:', issueDraft);
    const queryString = qs.stringify({
      draftId: issueDraft.id,
      fields: fields.issuesOnList.toString()
    });
    return await this.makeAuthorizedRequest(`${this.youTrackIssueUrl}?${queryString}`, 'POST', {});
  }

  async loadIssueDraft(draftId: string) {
    const queryString = qs.stringify({fields: fields.singleIssue.toString()});
    return await this.makeAuthorizedRequest(`${this.youTrackUrl}/api/admin/users/me/drafts/${draftId}?${queryString}`);
  }

  /**
   * Creates (if issue has no id) or updates issue draft
   * @param issue
   * @returns {Promise}
     */
  async updateIssueDraft(issue: IssueFull) {
    const queryString = qs.stringify({fields: fields.singleIssue.toString()});

    return await this.makeAuthorizedRequest(`${this.youTrackUrl}/api/admin/users/me/drafts/${issue.id || ''}?${queryString}`, 'POST', issue);
  }

  async addComment(issueId: string, comment: string) {
    const queryString = qs.stringify({fields: fields.issueComment.toString()});
    const url = `${this.youTrackIssueUrl}/${issueId}/comments?${queryString}`;

    const createdComment =  await this.makeAuthorizedRequest(url, 'POST', {text: comment});
    createdComment.author.avatarUrl = handleEmbeddedHubUrl(createdComment.author.avatarUrl, this.config.backendUrl);

    return createdComment;
  }

  async getUserFromHub(id: string) {
    const queryString = qs.stringify({fields: 'avatar/url'});
    return await this.makeAuthorizedRequest(`${this.config.auth.serverUri}/api/rest/users/${id}?${queryString}`);
  }

  async getProjects(query: string) {
    const queryString = qs.stringify({
      fields: fields.projectOnList.toString(),
      query: query
    });
    return await this.makeAuthorizedRequest(`${this.youTrackProjectUrl}?${queryString}`);
  }

  async getProject(projectId: string) {
    const queryString = qs.stringify({
      fields: fields.project.toString()
    });
    return await this.makeAuthorizedRequest(`${this.youTrackProjectUrl}/${projectId}?${queryString}`);
  }

  async updateProject(issue: IssueOnList, project: IssueProject) {
    const body = {
      id: issue.id,
      project: project
    };
    return await this.makeAuthorizedRequest(`${this.youTrackIssueUrl}/${issue.id}`, 'POST', body);
  }

  async getCustomFieldValues(bundleId: string, fieldValueType: string) {
    const queryString = qs.stringify({
      fields: fields.bundle.toString()
    });
    return await this.makeAuthorizedRequest(`${this.youtTrackFieldBundleUrl}/${fieldValueType}/${bundleId}?${queryString}`);
  }

  async getStateMachineEvents(issueId: string, fieldId: string) {
    const url = `${this.youTrackIssueUrl}/${issueId}/fields/${fieldId}/possibleEvents?fields=id,presentation`;
    return await this.makeAuthorizedRequest(url);
  }

  attachFile(issueId: string, fileUri: string, fileName: string) {
    const formDataContent = new FormData(); //eslint-disable-line no-undef
    formDataContent.append('photo', {uri: fileUri, name: fileName, type: 'image/binary'});

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest(); //eslint-disable-line no-undef
      xhr.open('POST', `${this.youTrackUrl}/rest/issue/${issueId}/attachment`);

      xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) {
          return;
        }
        if (xhr.status >= 200 && xhr.status < 400) {
          log.log('attach result', xhr);
          return resolve(xhr);
        }
        return reject(xhr);
      };
      xhr.send(formDataContent);
    });
  }

  async updateIssueSummaryDescription(issue: IssueFull) {
    const queryString = qs.stringify({fields: 'id,value'});
    const body = {summary: issue.summary, description: issue.description};

    return await this.makeAuthorizedRequest(`${this.youTrackIssueUrl}/${issue.id}?${queryString}`, 'POST', body);
  }

  async updateIssueFieldValue(issueId: string, fieldId: string, value: FieldValue) {
    const queryString = qs.stringify({fields: 'id,ringId,value'});
    const body = {id: fieldId, value};
    return await this.makeAuthorizedRequest(`${this.youTrackIssueUrl}/${issueId}/fields/${fieldId}?${queryString}`, 'POST', body);
  }

  async updateIssueFieldEvent(issueId: string, fieldId: string, event: Object) {
    const queryString = qs.stringify({fields: 'id,ringId,value'});
    const body = {id: fieldId, event};
    return await this.makeAuthorizedRequest(`${this.youTrackIssueUrl}/${issueId}/fields/${fieldId}?${queryString}`, 'POST', body);
  }

  async getMentionSuggests(issueIds: Array<string>, query: string) {
    const $top = 10;
    const fields = 'issues(id),users(id,login,fullName,avatarUrl)';
    const queryString = qs.stringify({$top, fields, query});
    const body = {issues:  issueIds.map(id => ({id}))};

    return await this.makeAuthorizedRequest(`${this.youTrackUrl}/api/mention?${queryString}`, 'POST', body);
  }

  //TODO: this is old API usage, move to new one
  async getQueryAssistSuggestions(query: string, caret: number) {
    const queryString = qs.stringify({query, caret});
    return await this.makeAuthorizedRequest(`${this.youTrackUrl}/rest/search/underlineAndSuggest?${queryString}`);
  }
}

export default Api;
