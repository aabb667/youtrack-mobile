import styles from './issue-list.styles';
import ColorField from '../../components/color-field/color-field';
import {next} from '../../components/icon/icon';
import {COLOR_FONT_GRAY} from '../../components/variables/variables';
import {getForText} from '../../components/issue-formatter/issue-formatter';
import {View, Text, TouchableOpacity, Image} from 'react-native';
import React from 'react';

export default class IssueRow extends React.Component {
  static _getSubText(issue) {
    const issueIdStyle = issue.resolved ? {textDecorationLine: 'line-through'} : null;

    return (<Text>
      <Text style={issueIdStyle}>{issue.project.shortName}-{issue.numberInProject}</Text>
      <Text> by {issue.reporter.fullName || issue.reporter.login} {getForText(issue.fieldHash.Assignee)}</Text>
    </Text>);  }

  getSummaryStyle(issue) {
    if (issue.resolved) {
      return {color: COLOR_FONT_GRAY, fontWeight: '200'};
    }
  }

  render() {
    const issue = this.props.issue;
    const prioityBlock =issue.fieldHash.Priority ?
      <ColorField text={issue.fieldHash.Priority.name} color={issue.fieldHash.Priority.color}></ColorField> :
      <View style={styles.priorityPlaceholder}/>;

    return (
      <TouchableOpacity onPress={() => this.props.onClick(issue)}>
        <View style={styles.row}>

          <View>
            <View style={styles.priorityWrapper}>{prioityBlock}</View>
          </View>

          <View style={styles.rowText}>

            <View style={styles.rowTopLine}>
              <Text style={[styles.summary, this.getSummaryStyle(issue)]} numberOfLines={2}>
                {issue.summary}
              </Text>
              <Image style={styles.arrowImage} source={next}></Image>
            </View>

            <Text style={styles.subtext} numberOfLines={1}>{IssueRow._getSubText(issue)}</Text>

          </View>
        </View>
      </TouchableOpacity>
    );
  }
}
