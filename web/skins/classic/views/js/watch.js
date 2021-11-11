var streamCmdTimer = null;
var streamStatus;
var alarmState = STATE_IDLE;
var lastAlarmState = STATE_IDLE;
var backBtn = $j('#backBtn');
var settingsBtn = $j('#settingsBtn');
var enableAlmBtn = $j('#enableAlmBtn');
var forceAlmBtn = $j('#forceAlmBtn');
var table = $j('#eventList');
var filterQuery = '&filter[Query][terms][0][attr]=MonitorId&filter[Query][terms][0][op]=%3d&filter[Query][terms][0][val]='+monitorId;

/*
This is the format of the json object sent by bootstrap-table

var params =
{
"type":"get",
"data":
  {
  "search":"some search text",
  "sort":"StartDateTime",
  "order":"asc",
  "offset":0,
  "limit":25
  "filter":
    {
    "Name":"some advanced search text"
    "StartDateTime":"some more advanced search text"
    }
  },
"cache":true,
"contentType":"application/json",
"dataType":"json"
};
*/

// Called by bootstrap-table to retrieve zm event data
function ajaxRequest(params) {
  // Maintain legacy behavior by statically setting these parameters
  var data = params.data;
  data.order = 'desc';
  data.limit = maxDisplayEvents;
  data.sort = 'Id';
  data.view = 'request';
  data.request = 'watch';
  data.mid = monitorId;
  if ( auth_hash ) data.auth = auth_hash;

  $j.getJSON(thisUrl, data)
      .done(function(data) {
        var rows = processRows(data.rows);
        params.success(rows);
      })
      .fail(logAjaxFail);
}

function processRows(rows) {
  $j.each(rows, function(ndx, row) {
    var eid = row.Id;

    row.Delete = '<i class="fa fa-trash text-danger"></i>';
    row.Id = '<a href="?view=event&amp;eid=' + eid + filterQuery + '">' + eid + '</a>';
    row.Name = '<a href="?view=event&amp;eid=' + eid + filterQuery + '">' + row.Name + '</a>';
    row.Frames = '<a href="?view=frames&amp;eid=' + eid + '">' + row.Frames + '</a>';
    row.AlarmFrames = '<a href="?view=frames&amp;eid=' + eid + '">' + row.AlarmFrames + '</a>';
    row.MaxScore = '<a href="?view=frame&amp;eid=' + eid + '&amp;fid=0">' + row.MaxScore + '</a>';
    if ( LIST_THUMBS ) row.Thumbnail = '<a href="?view=event&amp;eid=' + eid + filterQuery + '&amp;page=1">' + row.imgHtml + '</a>';
  });

  return rows;
}

function showEvents() {
  $j('#ptzControls').addClass('hidden');
  $j('#events').removeClass('hidden');
  if ($j('#eventsControl')) {
    $j('#eventsControl').addClass('hidden');
  }
  if ($j('#controlControl')) {
    $j('#controlControl').removeClass('hidden');
  }
  showMode = 'events';
}

function showPtzControls() {
  $j('#events').addClass('hidden');
  $j('#ptzControls').removeClass('hidden');
  if ($j('#eventsControl')) {
    $j('#eventsControl').removeClass('hidden');
  }
  if ($j('#controlControl')) {
    $j('#controlControl').addClass('hidden');
  }
  showMode = 'control';
}

function changeScale() {
  var scale = $j('#scale').val();
  var newWidth;
  var newHeight;
  var autoScale;

  // Always turn it off, we will re-add it below. I don't know if you can add a callback multiple
  // times and what the consequences would be
  $j(window).off('resize', endOfResize); //remove resize handler when Scale to Fit is not active
  if (scale == '0' || scale == 'auto') {
    var newSize = scaleToFit(monitorWidth, monitorHeight, $j('#liveStream'+monitorId), $j('#replayStatus'));
    newWidth = newSize.width;
    newHeight = newSize.height;
    autoScale = newSize.autoScale;
    $j(window).on('resize', endOfResize); //remove resize handler when Scale to Fit is not active
  } else {
    newWidth = monitorWidth * scale / SCALE_BASE;
    newHeight = monitorHeight * scale / SCALE_BASE;
  }

  setCookie('zmWatchScale'+monitorId, scale, 3600);

  var streamImg = $j('#liveStream'+monitorId);
  if (streamImg) {
    var oldSrc = streamImg.attr('src');
    streamImg.attr('src', '');
    // This is so that we don't waste bandwidth and let the browser do all the scaling.
    if (autoScale > 100) autoScale = 100;
    if (scale > 100) scale = 100;
    var newSrc = oldSrc.replace(/scale=\d+/i, 'scale='+((scale == 'auto' || scale == '0') ? autoScale : scale));

    streamImg.width(newWidth);
    streamImg.height(newHeight);
    streamImg.attr('src', newSrc);
  } else {
    console.error('No element found for liveStream'+monitorId);
  }
} // end function changeScale

function setAlarmState(currentAlarmState) {
  alarmState = currentAlarmState;

  var stateClass = '';
  if (alarmState == STATE_ALARM) {
    stateClass = 'alarm';
  } else if (alarmState == STATE_ALERT) {
    stateClass = 'alert';
  }
  $j('#stateValue').text(stateStrings[alarmState]);
  if (stateClass) {
    $j('#stateValue').addClass(stateClass);
  } else {
    $j('#stateValue').removeClass();
  }

  var isAlarmed = ( alarmState == STATE_ALARM || alarmState == STATE_ALERT );
  var wasAlarmed = ( lastAlarmState == STATE_ALARM || lastAlarmState == STATE_ALERT );

  var newAlarm = ( isAlarmed && !wasAlarmed );
  var oldAlarm = ( !isAlarmed && wasAlarmed );

  if (newAlarm) {
    table.bootstrapTable('refresh');
    if (SOUND_ON_ALARM) {
      // Enable the alarm sound
      if (!msieVer) {
        $j('#alarmSound').removeClass('hidden');
      } else {
        $j('#MediaPlayer').trigger('play');
      }
    }
    if (POPUP_ON_ALARM) {
      window.focus();
    }
  }
  if (oldAlarm) { // done with an event do a refresh
    table.bootstrapTable('refresh');
    if (SOUND_ON_ALARM) {
      // Disable alarm sound
      if (!msieVer) {
        $j('#alarmSound').addClass('hidden');
      } else {
        $j('#MediaPlayer').trigger('pause');
      }
    }
  }

  lastAlarmState = alarmState;
} // end function setAlarmState( currentAlarmState )

function getStreamCmdError(text, error) {
  console.log(error);
  // Error are normally due to failed auth. reload the page.

  //window.location.reload();
}

function getStreamCmdResponse(respObj, respText) {
  watchdogOk('stream');
  if (streamCmdTimer) {
    streamCmdTimer = clearTimeout(streamCmdTimer);
  }
  if (respObj.result == 'Ok') {
    // The get status command can get backed up, in which case we won't be able to get the semaphore and will exit.
    if (respObj.status) {
      streamStatus = respObj.status;
      $j('#fpsValue').text(streamStatus.fps);
      $j('#capturefpsValue').text(streamStatus.capturefps);
      $j('#analysisfpsValue').text(streamStatus.analysisfps);

      setAlarmState(streamStatus.state);

      $j('#levelValue').text(streamStatus.level);
      var newClass = 'ok';
      if (streamStatus.level > 95) {
        newClass = 'alarm';
      } else if (streamStatus.level > 80) {
        newClass = 'alert';
      }
      $j('#levelValue').removeClass();
      $j('#levelValue').addClass(newClass);

      var delayString = secsToTime(streamStatus.delay);

      if (streamStatus.paused == true) {
        $j('#modeValue').text('Paused');
        $j('#rate').addClass('hidden');
        $j('#delayValue').text(delayString);
        $j('#delay').removeClass('hidden');
        $j('#level').removeClass('hidden');
        streamCmdPause(false);
      } else if (streamStatus.delayed == true) {
        $j('#modeValue').text('Replay');
        $j('#rateValue').text(streamStatus.rate);
        $j('#rate').removeClass('hidden');
        $j('#delayValue').text(delayString);
        $j('#delay').removeClass('hidden');
        $j('#level').removeClass('hidden');
        if (streamStatus.rate == 1) {
          streamCmdPlay(false);
        } else if (streamStatus.rate > 0) {
          if (streamStatus.rate < 1) {
            streamCmdSlowFwd(false);
          } else {
            streamCmdFastFwd(false);
          }
        } else {
          if (streamStatus.rate > -1) {
            streamCmdSlowRev(false);
          } else {
            streamCmdFastRev(false);
          }
        } // rate
      } else {
        $j('#modeValue').text('Live');
        $j('#rate').addClass('hidden');
        $j('#delay').addClass('hidden');
        $j('#level').addClass('hidden');
        streamCmdPlay(false);
      } // end if paused or delayed

      $j('#zoomValue').text(streamStatus.zoom);
      if (streamStatus.zoom == '1.0') {
        setButtonState('zoomOutBtn', 'unavail');
      } else {
        setButtonState('zoomOutBtn', 'inactive');
      }

      if (canEdit.Monitors) {
        if (streamStatus.enabled) {
          enableAlmBtn.addClass('disabled');
          enableAlmBtn.prop('title', disableAlarmsStr);
          if (streamStatus.forced) {
            forceAlmBtn.addClass('disabled');
            forceAlmBtn.prop('title', cancelForcedAlarmStr);
          } else {
            forceAlmBtn.removeClass('disabled');
            forceAlmBtn.prop('title', forceAlarmStr);
          }
          forceAlmBtn.prop('disabled', false);
        } else {
          enableAlmBtn.removeClass('disabled');
          enableAlmBtn.prop('title', enableAlarmsStr);
          forceAlmBtn.prop('disabled', true);
        }
        enableAlmBtn.prop('disabled', false);
      } // end if canEdit.Monitors

      if (streamStatus.auth) {
        auth_hash = streamStatus.auth;
        // Try to reload the image stream.
        var streamImg = $j('#liveStream'+monitorId);
        if (streamImg) {
          var oldSrc = streamImg.attr('src');
          var newSrc = oldSrc.replace(/auth=\w+/i, 'auth='+streamStatus.auth);
          if (oldSrc != newSrc) {
            streamImg.attr('src', newSrc);
            table.bootstrapTable('refresh');
          }
        }
      } // end if have a new auth hash
    } // end if respObj.status
  } else {
    checkStreamForErrors('getStreamCmdResponse', respObj);//log them
    // Try to reload the image stream.
    // If it's an auth error, we should reload the whole page.
    console.log("have error");
    //window.location.reload();
    var streamImg = $j('#liveStream'+monitorId);
    if (streamImg) {
      var oldSrc = streamImg.attr('src');
      var newSrc = oldSrc.replace(/rand=\d+/i, 'rand='+Math.floor((Math.random() * 1000000) ));

      streamImg.attr('src', newSrc);
      console.log('Changing livestream src to ' + newSrc);
    } else {
      console.log('Unable to find streamImg liveStream');
    }
  }

  var streamCmdTimeout = statusRefreshTimeout;
  if (alarmState == STATE_ALARM || alarmState == STATE_ALERT) {
    streamCmdTimeout = streamCmdTimeout/5;
  }
  streamCmdTimer = setTimeout(streamCmdQuery, streamCmdTimeout);
}

function streamCmdPause(action) {
  setButtonState('pauseBtn', 'active');
  setButtonState('playBtn', 'inactive');
  setButtonState('stopBtn', 'inactive');
  if (monitorStreamReplayBuffer) {
    setButtonState('fastFwdBtn', 'inactive');
    setButtonState('slowFwdBtn', 'inactive');
    setButtonState('slowRevBtn', 'inactive');
    setButtonState('fastRevBtn', 'inactive');
  }
  if (action) {
    var data = {};
    if (auth_hash) data.auth = auth_hash;
    data.command = CMD_PAUSE;
    streamCmdReq(data);
  }
}

function streamCmdPlay(action) {
  setButtonState('pauseBtn', 'inactive');
  setButtonState('playBtn', 'active');
  if (streamStatus.delayed == true) {
    setButtonState('stopBtn', 'inactive');
    if (monitorStreamReplayBuffer) {
      setButtonState('fastFwdBtn', 'inactive');
      setButtonState('slowFwdBtn', 'inactive');
      setButtonState('slowRevBtn', 'inactive');
      setButtonState('fastRevBtn', 'inactive');
    }
  } else {
    setButtonState('stopBtn', 'unavail');
    if (monitorStreamReplayBuffer) {
      setButtonState('fastFwdBtn', 'unavail');
      setButtonState('slowFwdBtn', 'unavail');
      setButtonState('slowRevBtn', 'unavail');
      setButtonState('fastRevBtn', 'unavail');
    }
  }
  if (action) {
    var data = {};
    if (auth_hash) data.auth = auth_hash;
    data.command = CMD_PLAY;
    streamCmdReq(data);
  }
}

function streamCmdReq(data) {
  $j.getJSON(monitorUrl + '?view=request&request=stream&connkey='+connKey, data)
      .done(getStreamCmdResponse)
      .fail(getStreamCmdError);

  streamCmdTimer = null;
}

function streamCmdStop(action) {
  setButtonState('pauseBtn', 'inactive');
  setButtonState('playBtn', 'unavail');
  setButtonState('stopBtn', 'active');
  if (monitorStreamReplayBuffer) {
    setButtonState('fastFwdBtn', 'unavail');
    setButtonState('slowFwdBtn', 'unavail');
    setButtonState('slowRevBtn', 'unavail');
    setButtonState('fastRevBtn', 'unavail');
  }
  if (action) {
    var data = {};
    if (auth_hash) data.auth = auth_hash;
    data.command = CMD_STOP;
    streamCmdReq(data);
  }
  setButtonState('stopBtn', 'unavail');
  setButtonState('playBtn', 'active');
}

function streamCmdFastFwd(action) {
  setButtonState('pauseBtn', 'inactive');
  setButtonState('playBtn', 'inactive');
  setButtonState('stopBtn', 'inactive');
  if (monitorStreamReplayBuffer) {
    setButtonState('fastFwdBtn', 'inactive');
    setButtonState('slowFwdBtn', 'inactive');
    setButtonState('slowRevBtn', 'inactive');
    setButtonState('fastRevBtn', 'inactive');
  }
  if (action) {
    var data = {};
    if (auth_hash) data.auth = auth_hash;
    data.command = CMD_FASTFWD;
    streamCmdReq(data);
  }
}

function streamCmdSlowFwd(action) {
  setButtonState('pauseBtn', 'inactive');
  setButtonState('playBtn', 'inactive');
  setButtonState('stopBtn', 'inactive');
  if (monitorStreamReplayBuffer) {
    setButtonState('fastFwdBtn', 'inactive');
    setButtonState('slowFwdBtn', 'active');
    setButtonState('slowRevBtn', 'inactive');
    setButtonState('fastRevBtn', 'inactive');
  }
  if (action) {
    var data = {};
    if (auth_hash) data.auth = auth_hash;
    data.command = CMD_SLOWFWD;
    streamCmdReq(data);
  }
  setButtonState('pauseBtn', 'active');
  if (monitorStreamReplayBuffer) {
    setButtonState('slowFwdBtn', 'inactive');
  }
}

function streamCmdSlowRev(action) {
  setButtonState('pauseBtn', 'inactive');
  setButtonState('playBtn', 'inactive');
  setButtonState('stopBtn', 'inactive');
  if (monitorStreamReplayBuffer) {
    setButtonState('fastFwdBtn', 'inactive');
    setButtonState('slowFwdBtn', 'inactive');
    setButtonState('slowRevBtn', 'active');
    setButtonState('fastRevBtn', 'inactive');
  }
  if (action) {
    var data = {};
    if (auth_hash) data.auth = auth_hash;
    data.command = CMD_SLOWREV;
    streamCmdReq(data);
  }
  setButtonState('pauseBtn', 'active');
  if (monitorStreamReplayBuffer) {
    setButtonState('slowRevBtn', 'inactive');
  }
}

function streamCmdFastRev(action) {
  setButtonState('pauseBtn', 'inactive');
  setButtonState('playBtn', 'inactive');
  setButtonState('stopBtn', 'inactive');
  if (monitorStreamReplayBuffer) {
    setButtonState('fastFwdBtn', 'inactive');
    setButtonState('slowFwdBtn', 'inactive');
    setButtonState('slowRevBtn', 'inactive');
    setButtonState('fastRevBtn', 'inactive');
  }
  if (action) {
    var data = {};
    if (auth_hash) data.auth = auth_hash;
    data.command = CMD_FASTREV;
    streamCmdReq(data);
  }
}

function streamCmdZoomIn(x, y) {
  var data = {};
  if (auth_hash) data.auth = auth_hash;
  data.x = x;
  data.y = y;
  data.command = CMD_ZOOMIN;
  streamCmdReq(data);
}

function streamCmdZoomOut() {
  var data = {};
  if (auth_hash) data.auth = auth_hash;
  data.command = CMD_ZOOMOUT;
  streamCmdReq(data);
}

function streamCmdScale(scale) {
  var data = {};
  if (auth_hash) data.auth = auth_hash;
  data.command = CMD_SCALE;
  data.scale = scale;
  streamCmdReq(data);
}

function streamCmdPan(x, y) {
  var data = {};
  if (auth_hash) data.auth = auth_hash;
  data.x = x;
  data.y = y;
  data.command = CMD_PAN;
  streamCmdReq(data);
}

function streamCmdQuery() {
  var data = {};
  if (auth_hash) data.auth = auth_hash;
  data.command = CMD_QUERY;
  streamCmdReq(data);
}

function getStatusCmdResponse(respObj, respText) {
  watchdogOk('status');
  if (statusCmdTimer) {
    statusCmdTimer = clearTimeout(statusCmdTimer);
  }

  if (respObj.result == 'Ok') {
    $j('#fpsValue').text(respObj.monitor.FrameRate);
    setAlarmState(respObj.monitor.Status);
  } else {
    checkStreamForErrors('getStatusCmdResponse', respObj);
  }

  var statusCmdTimeout = statusRefreshTimeout;
  if ( alarmState == STATE_ALARM || alarmState == STATE_ALERT ) {
    statusCmdTimeout = statusCmdTimeout/5;
  }
  statusCmdTimer = setTimeout(statusCmdQuery, statusCmdTimeout);
}

function statusCmdQuery() {
  $j.getJSON(monitorUrl + '?view=request&request=status&entity=monitor&element[]=Status&element[]=FrameRate&id='+monitorId)
      .done(getStatusCmdResponse)
      .fail(logAjaxFail);

  streamCmdTimer = null;
}

function alarmCmdReq(data) {
  $j.getJSON(monitorUrl + '?view=request&request=alarm&id='+monitorId, data)
      .done(getAlarmCmdResponse)
      .fail(function(jqxhr, textStatus, error) {
        if ( textStatus === "timeout" ) {
          streamCmdQuery();
        } else {
          logAjaxFail(jqxhr, textStatus, error);
        }
      });
}

function getAlarmCmdResponse(respObj, respText) {
  checkStreamForErrors('getAlarmCmdResponse', respObj);
}

function cmdDisableAlarms() {
  var data = {};
  if (auth_hash) data.auth = auth_hash;
  data.command = 'disableAlarms';
  alarmCmdReq(data);
}

function cmdEnableAlarms() {
  var data = {};
  if (auth_hash) data.auth = auth_hash;
  data.command = 'enableAlarms';
  alarmCmdReq(data);
}

function cmdAlarm() {
  if (enableAlmBtn.hasClass('disabled')) {
    cmdEnableAlarms();
  } else {
    cmdDisableAlarms();
  }
}

function cmdForceAlarm() {
  var data = {};
  if (auth_hash) data.auth = auth_hash;
  data.command = 'forceAlarm';
  alarmCmdReq(data);
  if (window.event) window.event.preventDefault();
}

function cmdCancelForcedAlarm() {
  var data = {};
  if (auth_hash) data.auth = auth_hash;
  data.command = 'cancelForcedAlarm';
  alarmCmdReq(data);
  if (window.event) window.event.preventDefault();
  return false;
}

function cmdForce() {
  if (forceAlmBtn.hasClass('disabled')) {
    cmdCancelForcedAlarm();
  } else {
    cmdForceAlarm();
  }
}

function controlReq(data) {
  $j.getJSON(monitorUrl + '?view=request&request=control&id='+monitorId, data)
      .done(getControlResponse)
      .fail(logAjaxFail);
}

function getControlResponse(respObj, respText) {
  if (!respObj) {
    return;
  }
  //console.log( respText );
  if (respObj.result != 'Ok') {
    alert("Control response was status = "+respObj.status+"\nmessage = "+respObj.message);
  }
}

function controlCmd(event) {
  button = event.target;

  console.log(event);
  if (event.type !='mouseup') {
    control = button.getAttribute('value');
  } else {
    console.log('stop');
    console.log(event);
    control = 'moveStop';
  }
  xtell = button.getAttribute('data-xtell');
  ytell = button.getAttribute('data-ytell');

  var data = {};

  if (event && (xtell || ytell)) {
    var target = event.target;
    var offset = $j(target).offset();
    var width = $j(target).width();
    var height = $j(target).height();

    var x = event.pageX - offset.left;
    var y = event.pageY - offset.top;

    if (xtell) {
      var xge = parseInt((x*100)/width);
      if (xtell == -1) {
        xge = 100 - xge;
      } else if (xtell == 2) {
        xge = 2*(50 - xge);
      }
      data.xge = xge;
    }
    if (ytell) {
      var yge = parseInt((y*100)/height);
      if (ytell == -1) {
        yge = 100 - yge;
      } else if (ytell == 2) {
        yge = 2*(50 - yge);
      }
      data.yge = yge;
    }
  }

  if (auth_hash) data.auth = auth_hash;
  data.control = control;
  controlReq(data);

  if (streamMode == 'single') {
    setTimeout(fetchImage, 1000, $j('#imageFeed img'));
  }
}

function controlCmdImage(x, y) {
  var data = {};
  if (auth_hash) data.auth = auth_hash;
  data.scale = scale;
  data.control = imageControlMode;
  data.x = x;
  data.y = y;
  controlReq(data);

  if (streamMode == 'single') {
    setTimeout(fetchImage, 1000, $j('#imageFeed img'));
  }
}

function fetchImage(streamImage) {
  streamImage.attr('src', streamImage.attr('src').replace(/rand=\d+/i, 'rand='+Math.floor((Math.random() * 1000000) )));
}

function handleClick(event) {
  // target should be the img tag
  var target = $j(event.target);
  var width = target.width();
  var height = target.height();

  var scaleX = parseInt(monitorWidth / width);
  var scaleY = parseInt(monitorHeight / height);
  var pos = target.offset();
  var x = parseInt((event.pageX - pos.left) * scaleX);
  var y = parseInt((event.pageY - pos.top) * scaleY);

  if (showMode == 'events' || !imageControlMode) {
    if ( event.shift ) {
      streamCmdPan(x, y);
    } else if (event.ctrlKey) {
      streamCmdZoomOut();
    } else {
      streamCmdZoomIn(x, y);
    }
  } else {
    controlCmdImage(x, y);
  }
}

function appletRefresh() {
  if (streamStatus && (!streamStatus.paused && !streamStatus.delayed)) {
    var streamImg = $j('#liveStream'+monitorId);
    if (streamImg) {
      var parent = streamImg.parent();
      streamImg.remove();
      streamImg.append(parent);
    } else {
      console.error("Nothing found for liveStream"+monitorId);
    }
    if (appletRefreshTime) {
      setTimeout(appletRefresh, appletRefreshTime*1000);
    }
  } else {
    setTimeout(appletRefresh, 15*1000); // if we are paused or delayed check every 15 seconds if we are live yet...
  }
}

var watchdogInactive = {
  'stream': false,
  'status': false
};

var watchdogFunctions = {
  'stream': streamCmdQuery,
  'status': statusCmdQuery,
};

//Make sure the various refreshes are still taking effect
function watchdogCheck(type) {
  if (watchdogInactive[type]) {
    console.log("Detected streamWatch of type: " + type + " stopped, restarting");
    watchdogFunctions[type]();
    watchdogInactive[type] = false;
  } else {
    watchdogInactive[type] = true;
  }
}

function watchdogOk(type) {
  watchdogInactive[type] = false;
}

function reloadWebSite() {
  document.getElementById('imageFeed').innerHTML = document.getElementById('imageFeed').innerHTML;
}

function updatePresetLabels() {
  var lblNdx = $j('#ctrlPresetForm option:selected').val();

  $j('#newLabel').val(labels[lblNdx]);
}

function getCtrlPresetModal() {
  $j.getJSON(monitorUrl + '?request=modal&modal=controlpreset&mid=' + monitorId)
      .done(function(data) {
        insertModalHtml('ctrlPresetModal', data.html);
        updatePresetLabels();
        // Manage the Preset Select box
        $j('#preset').change(updatePresetLabels);
        // Manage the Save button
        $j('#cPresetSubmitModal').click(function(evt) {
          evt.preventDefault();
          $j('#ctrlPresetForm').submit();
        });
      })
      .fail(logAjaxFail);
}

function changeControl(e) {
  const input = e.target;
  $j.getJSON(monitorUrl+'?request=v4l2_settings&mid='+monitorId+'&'+input.name+'='+input.value)
      .done(function(evt) {
        if (evt.result == 'Ok') {
          evt.controls.forEach(function(control) {
            const element = $j('#new'+control.control.charAt(0).toUpperCase() + control.control.slice(1));
            if (element.length) {
              element.val(control.value);
              element.attr('title', control.value);
            } else {
              console.err('Element not found for #new'+control.control.charAt(0).toUpperCase() + control.control.slice(1));
            }
          });
        }
      })
      .fail(logAjaxFail);
}

function getSettingsModal() {
  $j.getJSON(monitorUrl + '?request=modal&modal=settings&mid=' + monitorId)
      .done(function(data) {
        insertModalHtml('settingsModal', data.html);
        // Manage the Save button
        $j('#settingsSubmitModal').click(function(evt) {
          evt.preventDefault();
          $j('#settingsForm').submit();
        });
        $j('#newBrightness').change(changeControl);
        $j('#newContrast').change(changeControl);
        $j('#newHue').change(changeControl);
        $j('#newColour').change(changeControl);
      })
      .fail(logAjaxFail);
}

function processClicks(event, field, value, row, $element) {
  if (field == 'Delete') {
    $j.getJSON(monitorUrl + '?request=modal&modal=delconfirm')
        .done(function(data) {
          insertModalHtml('deleteConfirm', data.html);
          manageDelConfirmModalBtns();
          $j('#deleteConfirm').data('eid', row.Id.replace(/(<([^>]+)>)/gi, ''));
          $j('#deleteConfirm').modal('show');
        })
        .fail(logAjaxFail);
  }
}

// Manage the DELETE CONFIRMATION modal button
function manageDelConfirmModalBtns() {
  document.getElementById("delConfirmBtn").addEventListener("click", function onDelConfirmClick(evt) {
    if (!canEdit.Events) {
      enoperm();
      return;
    }

    var eid = $j('#deleteConfirm').data('eid');

    evt.preventDefault();
    $j.getJSON(thisUrl + '?request=events&task=delete&eids[]='+eid)
        .done(function(data) {
          table.bootstrapTable('refresh');
          $j('#deleteConfirm').modal('hide');
        })
        .fail(logAjaxFail);
  });

  // Manage the CANCEL modal button
  document.getElementById("delCancelBtn").addEventListener("click", function onDelCancelClick(evt) {
    $j('#deleteConfirm').modal('hide');
  });
}

function msieVer() {
  var ua = window.navigator.userAgent;
  var msie = ua.indexOf("MSIE ");

  if (msie >= 0) { // If Internet Explorer, return version number
    return msie;
  } else { // If another browser, return 0
    return 0;
  }
}

function initPage() {
  if (canView.Control) {
    // Load the PTZ Preset modal into the DOM
    if (monitorControllable) getCtrlPresetModal();
    // Load the settings modal into the DOM
    if (monitorType == "Local") getSettingsModal();
  }

  if (monitorType != 'WebSite') {
    if (streamMode == 'single') {
      statusCmdTimer = setTimeout(statusCmdQuery, (Math.random()+0.1)*statusRefreshTimeout);
      setInterval(watchdogCheck, statusRefreshTimeout*2, 'status');
    } else {
      streamCmdTimer = setTimeout(streamCmdQuery, (Math.random()+0.1)*statusRefreshTimeout);
      setInterval(watchdogCheck, statusRefreshTimeout*2, 'stream');
    }

    if (canStreamNative || (streamMode == 'single')) {
      var streamImg = $j('#imageFeed img');
      if (!streamImg) {
        streamImg = $j('#imageFeed object');
      }
      if (!streamImg) {
        console.error('No streamImg found for imageFeed');
      } else {
        if (streamMode == 'single') {
          streamImg.click(streamImg, fetchImage);
          setInterval(fetchImage, imageRefreshTimeout, $j('#imageFeed img'));
        } else {
          streamImg.click(function(event) {
            handleClick(event);
          });
        }
      } // end if have streamImg
    } // streamMode native or single

    if (refreshApplet && appletRefreshTime) {
      setTimeout(appletRefresh, appletRefreshTime*1000);
    }
    if (window.history.length == 1) {
      $j('#closeControl').html('');
    }
    document.querySelectorAll('select[name="scale"]').forEach(function(el) {
      el.onchange = window['changeScale'];
    });
    changeScale();
  } else if (monitorRefresh > 0) {
    setInterval(reloadWebSite, monitorRefresh*1000);
  }

  // Manage the BACK button
  bindButton('#backBtn', 'click', null, function onBackClick(evt) {
    evt.preventDefault();
    window.history.back();
  });

  // Don't enable the back button if there is no previous zm page to go back to
  backBtn.prop('disabled', !document.referrer.length);

  // Manage the REFRESH Button
  bindButton('#refreshBtn', 'click', null, function onRefreshClick(evt) {
    evt.preventDefault();
    window.location.reload(true);
  });

  // Manage the SETTINGS button
  bindButton('#settingsBtn', 'click', null, function onSettingsClick(evt) {
    evt.preventDefault();
    $j('#settingsModal').modal('show');
  });

  // Only enable the settings button for local cameras
  settingsBtn.prop('disabled', !(canView.Control && (monitorType == 'Local')));

  // Init the bootstrap-table
  if (monitorType != 'WebSite') table.bootstrapTable({icons: icons});

  // Update table rows each time after new data is loaded
  table.on('post-body.bs.table', function(data) {
    $j('#eventList tr:contains("New Event")').addClass('recent');
  });

  // Take appropriate action when the user clicks on a cell
  table.on('click-cell.bs.table', processClicks);

  // Some toolbar events break the thumbnail animation, so re-init eventlistener
  table.on('all.bs.table', initThumbAnimation);

  // Update table links each time after new data is loaded
  table.on('post-body.bs.table', function(data) {
    var thumb_ndx = $j('#eventList tr th').filter(function() {
      return $j(this).text().trim() == 'Thumbnail';
    }).index();
    table.find("tr td:nth-child(" + (thumb_ndx+1) + ")").addClass('colThumbnail');
  });
} // initPage

function watchFullscreen() {
  const btn = document.getElementById('fullscreenBtn');
  console.log(btn);
  if (btn.firstElementChild.innerHTML=='fullscreen') {
    const content = document.getElementById('content');
    openFullscreen(content);
    btn.firstElementChild.innerHTML='fullscreen_exit';
    btn.setAttribute('title', translate["Exit Fullscreen"]);
  } else {
    closeFullscreen();
    btn.firstElementChild.innerHTML='fullscreen';
    btn.setAttribute('title', translate["Fullscreen"]);
  }
}

// Kick everything off
$j(document).ready(initPage);
