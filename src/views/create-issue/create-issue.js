import {ScrollView, View, Text, TextInput, TouchableOpacity, Image, AsyncStorage, ActivityIndicator, Platform} from 'react-native';
import React from 'react';
import flattenStyle from 'react-native/Libraries/StyleSheet/flattenStyle';

import styles from './create-issue.styles';
import issueStyles from '../single-issue/single-issue.styles';
import Header from '../../components/header/header';
import {notifyError, resolveError} from '../../components/notification/notification';
import usage from '../../components/usage/usage';
import ImagePicker from 'react-native-image-picker';
import Router from '../../components/router/router';
import log from '../../components/log/log';
import {attach, tag, next} from '../../components/icon/icon';
import CustomFieldsPanel from '../../components/custom-fields-panel/custom-fields-panel';
import MultilineInput from '../../components/multiline-input/multiline-input';
import KeyboardSpacer from 'react-native-keyboard-spacer';

const PROJECT_ID_STORAGE_KEY = 'YT_DEFAULT_CREATE_PROJECT_ID_STORAGE';
const DRAFT_ID_STORAGE_KEY = 'DRAFT_ID_STORAGE_KEY';
const FILE_NAME_REGEXP = /(?=\w+\.\w{3,4}$).+/ig;
const CATEGORY_NAME = 'Create issue view';
const imageWidth = flattenStyle(issueStyles.attachmentImage).width * 2;
const imageHeight = flattenStyle(issueStyles.attachmentImage).height * 2;

type Attachment = {
  data: string,
  uri: string,
  path: ?string,
  isVertical: boolean,
}

const notSelectedProject = {
  id: null,
  shortName: 'Not selected'
};

export default class CreateIssue extends React.Component {
  constructor() {
    super();
    this.state = {
      processing: false,
      attachingImage: null,

      issue: {
        summary: null,
        description: null,
        attachments: [],
        fields: [],
        project: notSelectedProject
      }
    };

    usage.trackScreenView('Create issue');

    this.initializeWithDraftOrProject();
  }

  async initializeWithDraftOrProject() {
    const draftId = await AsyncStorage.getItem(DRAFT_ID_STORAGE_KEY);
    if (draftId) {
      await this.loadIssueFromDraft(draftId);
    }
    await this.loadStoredProject();
  }

  async loadStoredProject() {
    const projectId = await AsyncStorage.getItem(PROJECT_ID_STORAGE_KEY);
    if (projectId) {
      this.state.issue.project.id = projectId;
      return await this.updateIssueDraft();
    }
  }

  async loadIssueFromDraft(draftId) {
    try {
      this.state.issue = await this.props.api.loadIssueDraft(draftId);
      this.forceUpdate();
    } catch (err) {
      AsyncStorage.removeItem(DRAFT_ID_STORAGE_KEY);
      this.state.issue.id = null;
      return await this.loadStoredProject();
    }
  }

  async updateIssueDraft(projectOnly = false) {
    const issueToSend = {...this.state.issue};
    if (!issueToSend.project || !issueToSend.project.id) {
      return;
    }

    //If we're changing project, fields shouldn't be passed to avoid "incompatible-issue-custom-field" error
    if (projectOnly) {
      delete issueToSend.fields;
    }

    try {
      const issue = await this.props.api.updateIssueDraft(issueToSend);
      this.state.issue = issue;
      this.forceUpdate();
      return await AsyncStorage.setItem(DRAFT_ID_STORAGE_KEY, issue.id);
    } catch (err) {
      const error = await resolveError(err);
      if (error && error.error_description && error.error_description.indexOf(`Can't find entity with id`) !== -1) {
        this.state.project = notSelectedProject;
        return this.forceUpdate();
      }
      notifyError('Cannot update issue draft', error);
    }
  }

  async createIssue() {
    this.setState({processing: true});

    try {
      await this.updateIssueDraft();
      const created = await this.props.api.createIssue(this.state.issue);
      log.info('Issue created', created);

      usage.trackEvent(CATEGORY_NAME, 'Issue created', 'Success');
      this.props.onCreate(created);
      Router.pop();
      return await AsyncStorage.removeItem(DRAFT_ID_STORAGE_KEY);

    } catch (err) {
      usage.trackEvent(CATEGORY_NAME, 'Issue created', 'Error');
      return notifyError('Cannot create issue', err);
    } finally {
      this.setState({processing: false});
    }
  }

  attachPhoto(takeFromLibrary = true) {
    const method = takeFromLibrary ? 'launchImageLibrary' : 'launchCamera';

    ImagePicker[method]({}, (res: Attachment) => {
      if (res.didCancel) {
        return;
      }
      if (res.error) {
        return notifyError('ImagePicker Error: ', res.error);
      }

      const filePath = res.path || res.uri;
      const fileName = filePath.match(FILE_NAME_REGEXP)[0];
      const fileUri = res.uri;

      const normalizedAttach = {
        url: fileUri,
        name: fileName
      };

      this.state.issue.attachments.push(normalizedAttach);
      this.forceUpdate();

      this.setState({attachingImage: normalizedAttach});
      this.props.api.attachFile(this.state.issue.id, fileUri, fileName)
        .then(() => {
          usage.trackEvent(CATEGORY_NAME, 'Attach image', 'Success');
          return this.setState({attachingImage: null});
        })
        .catch((err) => {
          this.state.issue.attachments = this.state.issue.attachments.filter(attach => attach !== normalizedAttach);
          this.setState({attachingImage: null});

          return notifyError('Cannot attach file', err);
        });
    });
  }

  async onUpdateProject(project) {
    this.state.issue.project = project;
    this.forceUpdate();

    usage.trackEvent(CATEGORY_NAME, 'Change project');
    await this.updateIssueDraft(project.id);
    return await AsyncStorage.setItem(PROJECT_ID_STORAGE_KEY, project.id);
  }

  onSetFieldValue(field, value) {
    this.state.issue.fields = this.state.issue.fields.slice().map(f => {
      if (f === field) {
        f.value = value;
      }
      return f;
    });

    this.forceUpdate();
    usage.trackEvent(CATEGORY_NAME, 'Change field value');
    return this.updateIssueDraft();
  }

  _showImageAttachment(currentImage, allAttachments) {
    const allImagesUrls = allAttachments
      .map(image => image.url);
    return Router.ShowImage({currentImage: currentImage.url, allImagesUrls});
  }

  _renderAttaches() {
    return this.state.issue.attachments.map(img => {
      const url = img.id ? `${img.url}&w=${imageWidth}&h=${imageHeight}` : img.url;

      return (
        <TouchableOpacity
          key={img.url || img.id}
          onPress={() => this._showImageAttachment(img, this.state.issue.attachments)}
        >
          <Image style={issueStyles.attachmentImage}
                 source={{uri: url}}/>
          {this.state.attachingImage === img && <ActivityIndicator size="large" style={styles.imageActivityIndicator}/>}
        </TouchableOpacity>
      );
    });
  }

  render() {
    const canCreateIssue = this.state.issue.summary && this.state.issue.project.id && !this.state.processing && !this.state.attachingImage;

    const createButton = <Text style={canCreateIssue ? null : styles.disabledCreateButton}>Create</Text>;

    return (
      <View style={styles.container}>
        <ScrollView keyboardShouldPersistTaps={true} keyboardDismissMode="interactive">
          <Header leftButton={<Text>Cancel</Text>}
                  onBack={() => {
                    this.updateIssueDraft();
                    Router.pop();
                  }}
                  rightButton={createButton}
                  onRightButtonClick={() => canCreateIssue && this.createIssue()}>
            <Text style={issueStyles.headerText}>New Issue</Text>
          </Header>
          <View>
            <View>
              <TextInput
                style={styles.summaryInput}
                editable={!this.state.processing}
                placeholder="Summary"
                underlineColorAndroid="transparent"
                returnKeyType="next"
                autoCapitalize="sentences"
                value={this.state.issue.summary}
                onSubmitEditing={() => this.refs.description.focus()}
                onChangeText={(summary) => {
                  this.state.issue.summary = summary;
                  this.forceUpdate();
                }}/>
            </View>
            <View style={styles.separator}/>
            <View>
              <MultilineInput
                ref="description"
                maxInputHeight={0}
                editable={!this.state.processing}
                autoCapitalize="sentences"
                style={styles.descriptionInput}
                multiline={true}
                underlineColorAndroid="transparent"
                placeholder="Description"
                value={this.state.issue.description}
                onChangeText={(description) => {
                  this.state.issue.description = description;
                  this.forceUpdate();
                }}/>
            </View>
            {this.state.issue.project.id && <View style={styles.attachesContainer}>
              <View>
                {this.state.issue.attachments.length > 0 && <ScrollView style={issueStyles.attachesContainer} horizontal={true}>
                  {this._renderAttaches(this.state.issue.attachments)}
                </ScrollView>}
              </View>
              <View style={styles.attachButtonsContainer}>
                <TouchableOpacity
                  disabled={this.state.attachingImage !== null}
                  style={styles.attachButton}
                  onPress={() => this.attachPhoto(true)}>
                  <Image style={styles.attachIcon} source={attach} resizeMode="contain"/>
                  <Text style={styles.attachButtonText}>Choose from library...</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  disabled={this.state.attachingImage !== null}
                  style={styles.attachButton}
                  onPress={() => this.attachPhoto(false)}>
                  <Text style={styles.attachButtonText}>Take a picture...</Text>
                </TouchableOpacity>
              </View>
            </View>}
            <View style={styles.separator}/>
            {false && <View style={styles.actionContainer}>
              <Image style={styles.actionIcon} source={tag}/>
              <View style={styles.actionContent}>
                <Text>Add tag</Text>
                <Image style={styles.arrowImage} source={next}></Image>
              </View>
            </View>}

            {Platform.OS == 'ios' && <KeyboardSpacer/>}
          </View>
        </ScrollView>

        <CustomFieldsPanel
          api={this.props.api}
          issue={this.state.issue}
          canEditProject={true}
          issuePermissions={{canUpdateField: () => true}}
          onUpdate={this.onSetFieldValue.bind(this)}
          onUpdateProject={this.onUpdateProject.bind(this)}/>
      </View>
    );
  }
}
