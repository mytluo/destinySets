/* eslint-disable import/no-webpack-loader-syntax */
import React, { Component } from 'react';
import cx from 'classnames';
import { mapValues, uniqBy, clone, toPairs } from 'lodash';

import * as destiny from 'app/lib/destiny';
import DestinyAuthProvider from 'app/lib/DestinyAuthProvider';

import Loading from 'app/views/Loading';
import LoginUpsell from 'app/components/LoginUpsell';
import ActivityList from 'app/components/ActivityList';
import Header from 'app/components/Header';
import Footer from 'app/components/Footer';
import ProfileSwitcher from 'app/components/MembershipSelector';

import styles from './styles.styl';

window.destiny = destiny;

const HEADER_TEXT = {
  strike: 'All Activities',
  raid: 'Raids',
};

const log = (msg, data) => {
  console.log(`%c${msg}:`, 'font-weight: bold', data);
};

function getClassFromTypeName(itemTypeName) {
  const name = itemTypeName.toLowerCase();
  if (name.includes('warlock')) {
    return 'warlock';
  } else if (name.includes('titan')) {
    return 'titan';
  } else if (name.includes('hunter')) {
    return 'hunter';
  } else {
    return 'noclass';
  }
}

const CUSTOM_ACTIVITY_NAME = {
  260765522: 'Wrath of the Machine (Normal)',
  1387993552: 'Wrath of the Machine (Hard)',
};

const DATA_URL_FOR_VARIATION = {
  raid: 'https://destiny.plumbing/en/collections/combinedRaidDrops.json',
};

class Drops extends Component {
  constructor(props) {
    super(props);

    this.variation = props.route.variation;
    this.dataUrl = DATA_URL_FOR_VARIATION[this.variation];

    this.state = {
      accountLoading: true,
      showDebug: false,
      loaded: false,
      accountSelected: false,
      filterCss: '',
    };
  }

  componentDidMount() {
    this.fetchDropLists();

    if (this.props.isAuthenticated) {
      this.fetchCharacters();
      this.poll();
    }
  }

  componentWillReceiveProps(newProps) {
    if (!this.props.isAuthenticated && newProps.isAuthenticated) {
      this.fetchCharacters(newProps);
      this.poll();
    }

    if (this.props.route.variation !== newProps.route.variation) {
      this.variation = newProps.route.variation;
      this.dataUrl = DATA_URL_FOR_VARIATION[this.variation];
      this.fetchDropLists();
    }
  }

  fetchDropLists() {
    destiny.get(this.dataUrl).then(dropLists => {
      this.dropLists = dropLists;
      this.dropLists.items = dropLists.items || dropLists.strikeItemHashes;
      this.updateState();
    });
  }

  fetchCharacters(props = this.props) {
    if (!props.isAuthenticated) {
      return;
    }

    destiny.getCurrentProfiles().then(profiles => {
      log('Profiles', profiles);
      this.setState({ accountLoading: false });

      if (profiles.length > 1) {
        this.setState({
          selectProfile: true,
          profiles,
        });
      } else {
        this.switchProfile(profiles[0]);
      }
    });
  }

  switchProfile = profile => {
    log('Profile', profile);

    const itemHashes = destiny.collectItemsFromProfile(profile);
    log('Inventory:', itemHashes);

    window.inventory = itemHashes;

    this.profile = profile;
    this.inventory = itemHashes;
    this.updateState();
    this.setState({ accountSelected: true });
  };

  transformItemList(itemList, activityData) {
    return (itemList || []).map(itemHash => {
      const item = activityData.items[itemHash];
      const dClass = getClassFromTypeName(item.itemTypeDisplayName);

      return {
        ...item,
        dClass,
        $obtained: this.inventory && this.inventory.includes(itemHash),
      };
    });
  }

  updateState() {
    if (!this.dropLists) {
      return;
    }

    const activityData = clone(this.dropLists);

    const activities = mapValues(activityData.activities, activity => {
      const dropList = activityData.dropLists[activity.dropListID];
      const activityName =
        CUSTOM_ACTIVITY_NAME[activity.activityHash] || activity.activityName;

      if (!dropList) {
        return {
          ...activity,
          activityName,
        };
      }

      const drops = this.transformItemList(dropList.items, activityData);
      const sections = (dropList.sections || []).map(section => {
        return {
          ...section,
          items: this.transformItemList(section.items, activityData),
        };
      });

      return {
        ...activity,
        activityName,
        drops,
        sections,
      };
    });

    const activitiesWithDrops = uniqBy(
      Object.values(activities).filter(activity => activity.drops),
      'activityName'
    );

    this.setState({
      activities,
      activitiesWithDrops,
      loaded: true,
      debugChar: JSON.stringify(this.profile, null, 2),
    });
  }

  poll() {
    // setInterval(() => {
    //   window.ga && window.ga('send', 'event', 'ping', 'raid-activity-check');
    // }, 60 * 1000);
    // setInterval(() => {
    //   this.fetchCharacters();
    // }, 30 * 1000);
  }

  refresh = () => {
    this.fetchCharacters();
  };

  updateFilter = opts => {
    const filterCss = toPairs(opts)
      .map(([dClass, shouldDisplay]) => {
        return `[data-class="${dClass}"] { display: ${shouldDisplay
          ? 'inline-block'
          : 'none'} }`;
      })
      .join('\n');

    this.setState({ filterCss });
  };

  toggleDebug = ev => {
    ev.preventDefault();
    this.setState({
      showDebug: !this.state.showDebug,
    });
  };

  copyDebug = ev => {
    ev.preventDefault();

    const copyTextarea = document.querySelector(`.${styles.debugField}`);
    copyTextarea.select();

    try {
      const successful = document.execCommand('copy');
      this.setState({ debugCopySuccessfull: !!successful });
    } catch (err) {
      this.setState({ debugCopySuccessfull: false });
    }
  };

  render() {
    const {
      err,
      loaded,
      filterCss,
      accountLoading,
      showDebug,
      debugChar,
      debugCopySuccessfull,
      selectProfile,
      profiles,
    } = this.state;

    if (err) {
      return <Loading>An error occurred! {this.state.err.message}</Loading>;
    }

    if (!loaded) {
      return <Loading>Loading...</Loading>;
    }

    return (
      <div className={styles.root}>
        <div className={styles.hero}>
          <Header onFilterChange={this.updateFilter} legacy={false} />

          <style dangerouslySetInnerHTML={{ __html: filterCss }} />

          {accountLoading && (
            <p className={styles.centerP}>Loading Destiny account...</p>
          )}

          {selectProfile && (
            <ProfileSwitcher
              profiles={profiles}
              onSelect={this.switchProfile}
            />
          )}

          {!this.props.isAuthenticated && (
            <LoginUpsell>See the items you've already collected.</LoginUpsell>
          )}
        </div>

        <ActivityList
          title={HEADER_TEXT[this.props.route.variation]}
          activities={this.state.activitiesWithDrops}
        />

        <p className={styles.debug}>
          <a className={styles.debugLink} href="#" onClick={this.toggleDebug}>
            {showDebug ? 'Hide' : 'View'} debug info
          </a>
        </p>

        <div
          className={cx(styles.debugBox, showDebug && styles.debugBoxActive)}
        >
          <p>
            Includes information from your Bungie account, including, Profiles,
            ProfileInventories, Characters, CharacterInventories,
            CharacterActivities, CharacterEquipment, ItemInstances,
            ItemCommonData, and Kiosks
          </p>
          <textarea
            readOnly
            className={styles.debugField}
            value={debugChar || 'Loading...'}
          />

          <p>
            Click the button below to copy, then save it somewhere like{' '}
            <a href="https://gist.github.com" target="_blank">
              gist.github.com
            </a>{' '}
            to send.
          </p>

          {debugCopySuccessfull && (
            <p>
              <strong>Successfully copied to clipboard.</strong>
            </p>
          )}

          <button className={styles.debugCopyButton} onClick={this.copyDebug}>
            Copy
          </button>
        </div>

        <Footer />
      </div>
    );
  }
}

export default DestinyAuthProvider(Drops);
