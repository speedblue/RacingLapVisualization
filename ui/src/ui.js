var Airtable = require('airtable');

const boolEnabled = "enabled"
const boolDisabled = "disabled"
const chartSmallSize = 110;
const chartMediumSize = 160;
const chartLargeSize = 210;
const chartXLargeSize = 275;
const chartXXLargeSize = 350;

var settings = {
    chartSize: "small",
    speedChart: boolEnabled,
    throttleChart: boolEnabled,
    brakeChart: boolEnabled,
    throttleBrakeChart: boolDisabled,
    gearChart: boolDisabled,
    swaChart: boolDisabled,
    damperChart: boolDisabled,
    timeDeltaChart: boolEnabled,
    speedDeltaChart: boolDisabled,
    throttleDeltaChart: boolDisabled,
    brakeDeltaChart: boolDisabled,
    driver: "Julien Lemoine",
    track: "Valencia",
    date: "2023-02-19",
    car: "Ligier JS2R",
    desc: null,
    event: "GTWS"
}

Highcharts.setOptions({colors: [ '#ff704d', '#00cc66', '#800000', '#006600', '#DDDF00', '#24CBE5', '#64E572', '#FF9655', '#FFF263', '#6AF9C4']
});

var telemetryData = null;
var speedChart = null;
var throttleChart = null;
var brakeChart = null;
var throttleBrakeChart = null;
var swaChart = null;
var damperChart = null;
var gearChart = null;
var speedDeltaChart = null;
var throttleDeltaChart = null;
var brakeDeltaChart = null;
var timeDeltaChart = null;
var timeSlipChart = null;

var currentZoom = null;

var base = null
var speedSeries = []
var throttleSeries = []
var brakeSeries = []
var throttleBrakeSeries = []
var gearSeries = []
var timeSeries = []
var gpsLatSeries = []
var gpsLongSeries = []
var swaSeries = []
var damperSeries = []
var maxDist = 0
var maxDist1 = 0
var maxDist2 = 0
var timeDeltaData = []
var timeSlipData = []
var baseEntries = []

// Scan the array and remplace empty values by the most accurate value (averrage of left + right values)
function normalizeValues(array) {
    // Fill left
    var left = 0;
    while (left < array.length && array[left] == null)
        ++left;
    if (left < array.length) {
        for (var i = 0; i < left; ++left)
            array[i] = array[left]
    }
    // Fill right
    var right = array.length - 1;
    while (right > 0 && array[right] == null)
        --right;
    if (right > 0) {
        for (var i = right + 1; i < array.length; ++i)
            array[i] = array[right];
    }
    for (var i = 0; i < array.length; ++i) {
        if (array[i] == null) {
            console.assert(i > 0, "null at left side of array")
            console.assert(array[i - 1] != null, "null at previous position of array")

            const firstEl = i;
            const left = i - 1;
            while (i < array.length && array[i] == null) ++i;
            const right = i;
            // Perform a linear approximation
            console.assert(i < array.length, "null at right side of array")
            console.assert(array[i] != null, "null at next position of array")
            const gap = (array[right] - array[left]) / (right - left)

            for (var j = firstEl; j < i; ++j) {
                array[j] = array[j - 1] + gap;
            }
        }
   }
}

function computeDeltaSurface(data1, data2) {
    var data = []
    var delta = 0.0
    for (var i = 0; i < data1.length; ++i) {
        delta += data1[i][1] - data2[i][1]
        data.push([i, delta]);
    }
    return data;
}

function computeDistance(lat1, lon1, lat2, lon2)
{
    const R = 6371e3; // metres
    const P1 = lat1 * Math.PI/180; // ??, ?? in radians
    const P2 = lat2 * Math.PI/180;
    const D0 = (lat2-lat1) * Math.PI/180;
    const D1 = (lon2-lon1) * Math.PI/180;

    const a = Math.sin(D0/2) * Math.sin(D0/2) +
              Math.cos(P1) * Math.cos(P2) *
              Math.sin(D1/2) * Math.sin(D1/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c; // in metres
}

function parseTelemetryData(telemetry) {
    
    var timePosition = -1;
    var distancePosition = -1;
    var speedPosition = -1;
    var brakePosition = -1;
    var throttlePosition = -1;
    var gearPosition = -1;
    var swaPosition = -1;
    var damperPosition = -1;
    var gpsLatPosition = -1;
    var gpsLongPosition = -1;
    speedSeries = []
    throttleSeries = []
    brakeSeries = []
    throttleBrakeSeries = []
    gearSeries = []
    timeSeries = []
    gpsLatSeries = []
    gpsLongSeries = []
    swaSeries = []
    damperSeries = []
    maxDist = 0
    maxDist1 = 0
    maxDist2 = 0
    timeDeltaData = []
    timeSlipData = []

    // analyze format
    for (var i = 0; i < telemetry.dataFormat.length; ++i) {
        switch (telemetry.dataFormat[i]) {
            case 'D':
                distancePosition = i;
                break;
            case 'T':
                timePosition = i;
                break;
            case 'S':
                speedPosition = i;
                break;
            case 'g':
                gearPosition = i;
                break;
            case 'b':
                brakePosition = i;
                break;
            case 't':
                throttlePosition = i;
                break;
            case 's':
                swaPosition = i;
                break;
            case 'x':
                gpsLatPosition = i;
                break;
            case 'y':
                gpsLongPosition = i;
                break;
            case 'd':
                damperPosition = i;
                break;
            default:
                console.log("Unknown data format:" + telemetry.dataFormat[i])
        }
    }
    console.assert(timePosition >= 0, "no time in data format")
    console.assert(distancePosition >= 0, "no distance in data format")
    console.assert(speedPosition >= 0, "no speed in data format")

    var count = 0
    for (var lap of telemetry.laps) {
        for (var d of lap.data) {
            if (d[distancePosition] >= maxDist) {
                maxDist = d[distancePosition] + 1
            }
            if (count == 0 && d[distancePosition] >= maxDist1) {
                maxDist1 = d[distancePosition] + 1
            }
            if (count == 1 && d[distancePosition] >= maxDist2) {
                maxDist2 = d[distancePosition] + 1
            }
        }
        ++count
    }

    var offsetRecall = 0
    var shortLap = -1
    if (telemetry.laps.length == 2 && gpsLatPosition >= 0 && gpsLongPosition >= 0) {
        // Compute offset
        shortLap = maxDist1 < maxDist2 ? 0 : 1;
        offsetRecall = Math.abs(maxDist2 - maxDist1) / maxDist
    }
    throttleBrakeSeries = Array(telemetry.laps.length * 2).fill(null)
    for (var pos = 0; pos < telemetry.laps.length; ++pos) {
        var lap = telemetry.laps[pos]
        var time = Array(maxDist).fill(null)
        var speed = Array(maxDist).fill(null)
        var gear = Array(maxDist).fill(null)
        var throttle = Array(maxDist).fill(null)
        var brake = Array(maxDist).fill(null)
        var swa = Array(maxDist).fill(null)
        var damper = Array(maxDist).fill(null)
        var gpsLat = Array(maxDist).fill(null)
        var gpsLong = Array(maxDist).fill(null)

        for (var d of lap.data) {
           
            var dist = d[distancePosition];
            if (pos == shortLap)
                dist += Math.round(d[distancePosition] * offsetRecall)
            console.assert(dist < maxDist, "dist >= maxDist failed");
            time[dist] = d[timePosition]
            speed[dist] = d[speedPosition]
            if (gearPosition >= 0)
                gear[dist] = d[gearPosition]
            if (throttlePosition >= 0)
                throttle[dist] = d[throttlePosition]
            if (brakePosition >= 0)
                brake[dist] = d[brakePosition]
            if (swaPosition >= 0)
                swa[dist] = d[swaPosition]
            if (damperPosition >=- 0)
                damper[dist] = d[damperPosition]
            if (gpsLatPosition >= 0)
                gpsLat[dist] = d[gpsLatPosition]
            if (gpsLongPosition >= 0)
                gpsLong[dist] = d[gpsLongPosition]
        }

        normalizeValues(time)
        normalizeValues(speed)
        if (gearPosition >= 0)
            normalizeValues(gear)
        if (throttlePosition >= 0)
            normalizeValues(throttle)
        if (brakePosition >= 0)
            normalizeValues(brake)
        if (swaPosition >= 0)
            normalizeValues(swa)
        if (damperPosition >= 0)
            normalizeValues(damper)
        if (gpsLatPosition >= 0)
            normalizeValues(gpsLat)
        if (gpsLongPosition >= 0)
            normalizeValues(gpsLong)
        
        var speedObj = {data: [], name: lap.name, type: 'line', tooltip: {valueDecimals:1},
            point: { events: { mouseOver: speedChartMouseOver, mouseOut: speedChartMouseOut}} }
        var throttleObj = {data: [], name: lap.name, type: 'line', tooltip: {valueDecimals:1},
            point: { events: { mouseOver: throttleChartMouseOver, mouseOut: throttleChartMouseOut}} }
        var throttleObj2 = {data: [], name: lap.name + ' Throttle', type: 'line', tooltip: {valueDecimals:1},
            point: { events: { mouseOver: throttleBrakeChartMouseOver, mouseOut: throttleBrakeChartMouseOut}} }
        var brakeObj = {data: [], name: lap.name, type: 'line', tooltip: {valueDecimals:1},
            point: { events: { mouseOver: brakeChartMouseOver, mouseOut: brakeChartMouseOut}} }
        var brakeObj2 = {data: [], name: lap.name + ' Brake', type: 'line', tooltip: {valueDecimals:1},
            point: { events: { mouseOver: throttleBrakeChartMouseOver, mouseOut: throttleBrakeChartMouseOut}} }
        var swaObj = {data: [], name: lap.name, type: 'line', tooltip: {valueDecimals:1},
            point: { events: { mouseOver: swaChartMouseOver, mouseOut: swaChartMouseOut}} }
        var damperObj = {data: [], name: lap.name, type: 'line', tooltip: {valueDecimals:1},
            point: { events: { mouseOver: damperChartMouseOver, mouseOut: damperChartMouseOut}} }
        var gearObj = {data: [], name: lap.name, type: 'line', tooltip: {valueDecimals:1},
            point: { events: { mouseOver: gearChartMouseOver, mouseOut: gearChartMouseOut}} }
        for (var i = 0; i < maxDist; ++i) {
            speedObj.data.push([i, speed[i]])
            throttleObj.data.push([i, throttle[i]])
            brakeObj.data.push([i, brake[i]])
            swaObj.data.push([i, swa[i]])
            damperObj.data.push([i, damper[i]])
            gearObj.data.push([i, gear[i]])
        }
        brakeObj2.data = brakeObj.data
        throttleObj2.data = throttleObj.data
        throttleBrakeSeries[pos] = throttleObj2
        throttleBrakeSeries[telemetry.laps.length + pos] = brakeObj2
        speedSeries.push(speedObj)
        throttleSeries.push(throttleObj)
        brakeSeries.push(brakeObj)
        gearSeries.push(gearObj)
        swaSeries.push(swaObj)
        damperSeries.push(damperObj)
        timeSeries.push(time)
        gpsLatSeries.push(gpsLat)
        gpsLongSeries.push(gpsLong)
    }
    // Compute TimeDelta Graph
    
    if (timeSeries.length == 2) {
        // Compute the simple diff between the two times
        for (var i = 0; i < maxDist; ++i) {
            var delta = timeSeries[1][i] - timeSeries[0][i]
            timeDeltaData.push(delta)
            timeSlipData.push(0);
        }
        // Remove all the small glitches by doing a mean between 3 consecutives data points
        var tmpTimeDelta = Array(maxDist).fill(0);
        for (var i = 0; i < maxDist; ++i) {
            const prev = i > 0 ? timeDeltaData[i - 1] : timeDeltaData[i];
            const next = (i + 1 < maxDist) ? timeDeltaData[i + 1] : timeDeltaData[i];
            const avg = (prev + next + timeDeltaData[i]) / 3
            tmpTimeDelta[i] = Math.round(avg * 100) / 100.0 // Move precision to 0.01s;
        }
        timeDeltaData = tmpTimeDelta;
        
        // reduce noise in timeDeltaData by checking inside a 20m area if there are small spikes smaller than 0.1s and coming back to the same initial value
        for (var i = 0; i < timeDeltaData.length; ++i) {
            var found = 0;
            for (var j = 1; j < 20 && (i + j) < timeDeltaData.length; ++j) {
                if (timeDeltaData[i] == timeDeltaData[i + j]) {
                    found = j;
                }
            }
            if (found > 0) {
                for (var j = 1; j < found; ++j) {
                    if (Math.abs(timeDeltaData[i + j] - timeDeltaData[i]) < 0.1)
                        timeDeltaData[i + j] = timeDeltaData[i]
                }
            }
        }
        // For each value, perform a linear approximation to the next 0.01s increment (avoid jump on the screen)
        for (var i = 0; i < timeDeltaData.length; ) {
            var j = i + 1;
            while (timeDeltaData[i] == timeDeltaData[j] && j < timeDeltaData.length)
                ++j;
            if (j < timeDeltaData.length) {
                // Do a linear approx between i and j
                const left = i;
                const right = j;
                
                const gap = (timeDeltaData[right] - timeDeltaData[left]) / (right - left)
                
                for (var k = i + 1; k < j; ++k) {
                    timeDeltaData[k] = timeDeltaData[k - 1] + gap;
                }
            }
            i = j;
        }
        for (var i = 5; i < timeDeltaData.length; ++i) {
            timeSlipData[i] = timeDeltaData[i] - timeDeltaData[i - 5];
        }
    }
}

function refreshTooltips(srcChart, dstChart, position, enabled) {
    if (srcChart != dstChart && dstChart != null) {
        if (enabled) {
            dstChart.xAxis[0].drawCrosshair(null, dstChart.series[0].data[position]);
            if (dstChart.series.length == 2)
                dstChart.tooltip.refresh([dstChart.series[0].data[position], dstChart.series[1].data[position]]);
            else
                dstChart.tooltip.refresh(dstChart.series[0].data[position]);
            dstChart.series[0].data[position].setState('hover')
            if (dstChart.series.length == 2)
                dstChart.series[1].data[position].setState('hover')
        } else {
            dstChart.series[0].data[position].setState('')
            if (dstChart.series.length == 2)
                dstChart.series[1].data[position].setState('')
        }
    }
}
function refreshAllTooltips(srcChart, position, enabled) {
    if (stringToBool(settings.speedChart)) refreshTooltips(srcChart, speedChart, position, enabled)
    if (stringToBool(settings.throttleChart)) refreshTooltips(srcChart, throttleChart, position, enabled)
    if (stringToBool(settings.brakeChart)) refreshTooltips(srcChart, brakeChart, position, enabled)
    if (stringToBool(settings.throttleBrakeChart)) refreshTooltips(srcChart, throttleBrakeChart, position, enabled)
    if (stringToBool(settings.gearChart)) refreshTooltips(srcChart, gearChart, position, enabled)
    if (stringToBool(settings.swaChart)) refreshTooltips(srcChart, swaChart, position, enabled)
    if (stringToBool(settings.damperChart)) refreshTooltips(srcChart, damperChart, position, enabled)
    if (stringToBool(settings.speedDeltaChart)) refreshTooltips(srcChart, speedDeltaChart, position, enabled)
    if (stringToBool(settings.throttleDeltaChart)) refreshTooltips(srcChart, throttleDeltaChart, position, enabled)
    if (stringToBool(settings.brakeDeltaChart)) refreshTooltips(srcChart, brakeDeltaChart, position, enabled)
    if (stringToBool(settings.timeDeltaChart)) refreshTooltips(srcChart, timeDeltaChart, position, enabled)
    if (stringToBool(settings.timeDeltaChart)) refreshTooltips(srcChart, timeSlipChart, position, enabled)
    drawMap(position)
}
function speedChartMouseOver(e) { refreshAllTooltips(speedChart, this.x, true); }
function speedChartMouseOut(e) { refreshAllTooltips(speedChart, this.x, false); }
function throttleChartMouseOver(e) { refreshAllTooltips(throttleChart, this.x, true); }
function throttleChartMouseOut(e) { refreshAllTooltips(throttleChart, this.x, false); }
function throttleBrakeChartMouseOver(e) { refreshAllTooltips(throttleBrakeChart, this.x, true); }
function throttleBrakeChartMouseOut(e) { refreshAllTooltips(throttleBrakeChart, this.x, false); }
function brakeChartMouseOver(e) { refreshAllTooltips(brakeChart, this.x, true); }
function brakeChartMouseOut(e) { refreshAllTooltips(brakeChart, this.x, false); }
function swaChartMouseOver(e) { refreshAllTooltips(swaChart, this.x, true); }
function swaChartMouseOut(e) { refreshAllTooltips(swaChart, this.x, false); }
function damperChartMouseOver(e) { refreshAllTooltips(damperChart, this.x, true); }
function damperChartMouseOut(e) { refreshAllTooltips(damperChart, this.x, false); }
function gearChartMouseOver(e) { refreshAllTooltips(gearChart, this.x, true); }
function gearChartMouseOut(e) { refreshAllTooltips(gearChart, this.x, false); }
function speedDeltaChartMouseOver(e) { refreshAllTooltips(speedDeltaChart, this.x, true); }
function speedDeltaChartMouseOut(e) { refreshAllTooltips(speedDeltaChart, this.x, false); }
function throttleDeltaChartMouseOver(e) { refreshAllTooltips(throttleDeltaChart, this.x, true); }
function throttleDeltaChartMouseOut(e) { refreshAllTooltips(throttleDeltaChart, this.x, false); }
function brakeDeltaChartMouseOver(e) { refreshAllTooltips(brakeDeltaChart, this.x, true); }
function brakeDeltaChartMouseOut(e) { refreshAllTooltips(brakeDeltaChart, this.x, false); }
function timeDeltaChartMouseOver(e) { refreshAllTooltips(timeDeltaChart, this.x, true); }
function timeDeltaChartMouseOut(e) { refreshAllTooltips(timeDeltaChart, this.x, false); }
function timeSlipChartMouseOver(e) { refreshAllTooltips(timeSlipChart, this.x, true); }
function timeSlipChartMouseOut(e) { refreshAllTooltips(timeSlipChart, this.x, false); }

function metersToKm(value) {
    var res = Math.floor(value / 1000) + '.';
    var meters = Math.floor(value % 1000)
    if (meters < 10)
	return res + '00' + meters + ' km';
    if (meters < 100)
	return res + '0' + meters + ' km';
    return res + meters + ' km';
}
function displayLapTime(lapData) {
    const lastEl = lapData[lapData.length - 1]
    const timeInSec = lastEl[1]
    const sec = (Math.floor(timeInSec) % 60)
    const msec = (Math.floor(timeInSec * 100) % 100)
    return Math.floor(timeInSec / 60) + ':' + (sec < 10 ? '0' : '') + sec + '.' + (msec < 10 ? '0' : '') + msec;
}

function setSummaryContent() {
    if (telemetryData == null)
        return;
    var value = settings.track + '</br>' + metersToKm(maxDist) + '</br>' + settings.car + '</br>' + settings.date + '</br>' + (settings.desc ? settings.desc : settings.event) + '</br>' +
        telemetryData.laps[0].name + ' in ' + displayLapTime(telemetryData.laps[0].data) + ' (' + maxDist1 + 'm)</br>';
    if (telemetryData.laps.length == 2) {
        value += telemetryData.laps[1].name + ' in ' + displayLapTime(telemetryData.laps[1].data) + ' (' + maxDist2 + 'm)</br>';
        value += Math.abs(maxDist2 - maxDist1) + ' meters</br>';
    } else {
	document.getElementById('leftSummaryDiv').innerHTML = 'Track:</br>Length:</br>Car:</br>Date:</br>Event:</br>Lap:</br>Zoom:';
    }
    if (currentZoom == null) {
        value += 'Full Track';
    } else {
        value += metersToKm(currentZoom[0]) + ' to ' + metersToKm(currentZoom[1]);
    }
    document.getElementById('rightSummaryDiv').innerHTML = value;
}

function updateOneChartZoom(srcChart, dstChart, min, max) {
    
    const reset = (min == null && max == null)
    if (reset)
        currentZoom = null;
    else
        currentZoom = [min, max];
    if (srcChart != dstChart && dstChart != null) {
        dstChart.xAxis[0].setExtremes(min, max, true, true)
    }
    if (dstChart != null) {
        if (reset)
            dstChart.resetZoomButton.hide();
        else
            dstChart.showResetZoom();
    }
}
function updateAllChartZoom(srcChart, min, max) {
    updateOneChartZoom(srcChart, speedChart, min, max)
    updateOneChartZoom(srcChart, throttleChart, min, max)
    updateOneChartZoom(srcChart, throttleBrakeChart, min, max)
    updateOneChartZoom(srcChart, brakeChart, min, max)
    updateOneChartZoom(srcChart, gearChart, min, max)
    updateOneChartZoom(srcChart, swaChart, min, max)
    updateOneChartZoom(srcChart, damperChart, min, max)
    updateOneChartZoom(srcChart, speedDeltaChart, min, max)
    updateOneChartZoom(srcChart, throttleDeltaChart, min, max)
    updateOneChartZoom(srcChart, brakeDeltaChart, min, max)
    updateOneChartZoom(srcChart, timeDeltaChart, min, max)
    updateOneChartZoom(srcChart, timeSlipChart, min, max)
    setSummaryContent()
    drawMap(null)

}
function applyChartSelection(chart, event) {
    if (event.xAxis != null && event.xAxis[0] != null) {
        updateAllChartZoom(chart, event.xAxis[0].min, event.xAxis[0].max)
    } else {
        updateAllChartZoom(chart, null, null)
    }
}
function speedChartSelection(event) { applyChartSelection(speedChart, event) }
function throttleChartSelection(event) { applyChartSelection(throttleChart, event) }
function throttleBrakeChartSelection(event) { applyChartSelection(throttleBrakeChart, event) }
function swaChartSelection(event) { applyChartSelection(swaChart, event) }
function damperChartSelection(event) { applyChartSelection(damperChart, event) }
function brakeChartSelection(event) { applyChartSelection(brakeChart, event) }
function gearChartSelection(event) { applyChartSelection(gearChart, event) }
function speedDeltaChartSelection(event) { applyChartSelection(speedDeltaChart, event) }
function throttleDeltaChartSelection(event) { applyChartSelection(throttleDeltaChart, event)}
function brakeDeltaChartSelection(event) { applyChartSelection(brakeDeltaChart, event)}
function timeDeltaChartSelection(event) { applyChartSelection(timeDeltaChart, event)}
function timeSlipChartSelection(event) { applyChartSelection(timeSlipChart, event)}

var secondLapOffset = 0;
var origSpeedSeries2 = Array()
var newSpeedSeries2 = Array()
var origBrakeSeries2 = Array()
var newBrakeSeries2 = Array()
var origThrottleSeries2 = Array()
var newThrottleSeries2 = Array()
var origDamperSeries2 = Array()
var newDamperSeries2 = Array()

function offsetSecondLapGraphes() {
    if (speedChart.series.length != 2)
        return;
    if (origSpeedSeries2.length == 0) {
        // First instance, copy orig data
        for (var i = 0; i < maxDist; ++i) {
            newSpeedSeries2.push([i, 0]);
            newBrakeSeries2.push([i, 0]);
            newThrottleSeries2.push([i, 0]);
            newDamperSeries2.push([i, 0])
            origSpeedSeries2.push([i, speedSeries[1].data[i][1]])
            origBrakeSeries2.push([i, brakeSeries[1].data[i][1]])
            origThrottleSeries2.push([i, throttleSeries[1].data[i][1]])
            origDamperSeries2.push([i, damperSeries[1].data[i][1]])
        }
    }
    for (var i = 0; i < maxDist; ++i) {
        newPos = i + secondLapOffset;
        if (newPos < 0) {
            newPos = maxDist + newPos
        } else if (newPos >= maxDist) {
            newPos = newPos % maxDist
        }
        newSpeedSeries2[newPos][1] = origSpeedSeries2[i][1]
        newBrakeSeries2[newPos][1] = origBrakeSeries2[i][1]
        newThrottleSeries2[newPos][1] = origThrottleSeries2[i][1]
        newDamperSeries2[newPos][1] = origDamperSeries2[i][1]
    }
    speedChart.series[1].setData(newSpeedSeries2)
    brakeChart.series[1].setData(newBrakeSeries2)
    throttleChart.series[1].setData(newThrottleSeries2)
    damperChart.series[1].setData(newDamperSeries2)
    damperChart.redraw();
    throttleBrakeChart.series[1].setData(newThrottleSeries2)
    throttleBrakeChart.series[3].setData(newBrakeSeries2)
    throttleBrakeChart.redraw();
}
function resetSecondLapGraphes() {
    secondLapOffset = 0;
    if (speedChart.series.length != 2)
        return;
    speedChart.series[1].setData(origSpeedSeries2)
    brakeChart.series[1].setData(origBrakeSeries2)
    throttleChart.series[1].setData(origThrottleSeries2)
    damperChart.series[1].setData(origDamperSeries2)
    throttleBrakeChart.series[1].setData(origThrottleSeries2)
    throttleBrakeChart.series[3].setData(origBrakeSeries2)
    throttleBrakeChart.redraw();
}
function moveSecondLapLeft() {
    --secondLapOffset;
    offsetSecondLapGraphes()
}
function moveSecondLapRight() {
    ++secondLapOffset;
    offsetSecondLapGraphes()
}

// Navigation by left/right key in the graphs when zoom is active
window.onload = function (){
    const eventHandler = function (e) {

        // Handle graph sync
        if (e.shiftKey && e.keyCode == 37) { // Shift Left
            moveSecondLapLeft();
            return;
        } else if (e.shiftKey && e.keyCode == 39) { // Shift Right
            moveSecondLapRight();
            return;
        } else if (e.shiftKey && e.keyCode == 82) { // Shift r
            resetSecondLapGraphes();
            return;
        } else if (e.keyCode == 187 || e.keyCode == 107) { // + key
            if (currentZoom == null) {
                navigationIncrement = 0.25 * maxDist
                updateAllChartZoom(null, (navigationIncrement / 2), maxDist - (navigationIncrement / 2))
            } else {
                navigationIncrement = Math.round(0.25 * (currentZoom[1] - currentZoom[0]));
                updateAllChartZoom(null, currentZoom[0] + navigationIncrement / 2, currentZoom[1] - navigationIncrement / 2);
            }
            return;
        }
        
        // Zoom handling via Left/Right/- keys
        if (currentZoom == null)
            return;
        navigationIncrement = Math.round(0.25 * (currentZoom[1] - currentZoom[0])); // going left/right by 1/4, zooming out by 25%
        if (e.keyCode == 189 || e.keyCode == 109 || e.keyCode == 54) { // - key + '6' key for some french keyboard
            left = (currentZoom[0] < (navigationIncrement / 2)) ? 0 : currentZoom[0] - (navigationIncrement / 2);
            right = ((currentZoom[1] + (navigationIncrement / 2)) > maxDist) ? maxDist : currentZoom[1] + (navigationIncrement / 2);
            updateAllChartZoom(null, left, right);
        } else if (!e.shiftKey && e.keyCode == 37) { // Left
            if (currentZoom[0] > navigationIncrement)
                updateAllChartZoom(null, currentZoom[0] - navigationIncrement, currentZoom[1] - navigationIncrement);
            else
                updateAllChartZoom(null, 0, currentZoom[1] - currentZoom[0]);
        } else if (!e.shiftKey && e.keyCode == 39) { // Right
            if (currentZoom[1] + navigationIncrement < maxDist)
                updateAllChartZoom(null, currentZoom[0] + navigationIncrement, currentZoom[1] + navigationIncrement);
            else
                updateAllChartZoom(null, maxDist - (currentZoom[1] - currentZoom[0]), maxDist)
        }
    }
  window.addEventListener('keydown', eventHandler, false);
}


function resizeGraphHeight(size) {
    for (const graphContainer of ['speed_container', 'brake_container', 'throttle_container', 'throttleBrake_container', 'speedDelta_container', 'brakeDelta_container', 'throttleDelta_container', 'timeDelta_container', 'timeSlip_container', 'gear_container', 'swa_container', 'damper_container']) {
        document.getElementById(graphContainer).style.height = size + 'px';
    }
    if (speedChart) speedChart.reflow()
    if (throttleChart) throttleChart.reflow()
    if (brakeChart) brakeChart.reflow()
    if (throttleBrakeChart) throttleBrakeChart.reflow()
    if (gearChart) gearChart.reflow()
    if (swaChart) swaChart.reflow()
    if (damperChart) damperChart.reflow()
    if (speedDeltaChart) speedDeltaChart.reflow()
    if (throttleDeltaChart) throttleDeltaChart.reflow()
    if (brakeDeltaChart) brakeDeltaChart.reflow()
    if (timeDeltaChart) timeDeltaChart.reflow()
    if (timeSlipChart) timeSlipChart.reflow()
}

function getMapScale() {
    var left = Infinity
    var right  = -Infinity;
    var top  = Infinity
    var bottom = -Infinity;
    
    for (var i = 0; i < gpsLatSeries[0].length; ++i) {
        const latitude = gpsLatSeries[0][i];
        const longitude = gpsLongSeries[0][i];
        if (left   > latitude ) left   = latitude;
        if (top    > longitude) top    = longitude;
        if (right  < latitude ) right  = latitude;
        if (bottom < longitude) bottom = longitude;
    }
    return { offsetX: -left, offsetY: -top, scaleX: right - left, scaleY: bottom - top}
}

function drawMap(position) {
  if (gpsLatSeries.length == 0 || gpsLongSeries.length == 0)
      return;
  var canvas = document.getElementById("mapCanvas")
  var mapScale = getMapScale();
  const canvasScale = Math.min(canvas.width, canvas.height);
  const canvasOffsetX = (canvasScale == canvas.width ? 0 : (canvas.width - canvas.height) / 2);
  const canvasOffsetY = (canvasScale == canvas.height ? 0 : (canvas.height - canvas.width) / 2);
  var ctx = canvas.getContext("2d");
  const margin = 6; // 3 pixel on each side to allow display of the circle
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (var i = 0; i < gpsLatSeries[0].length; ++i) {
      const latitude = (gpsLatSeries[0][i] + mapScale.offsetX) / mapScale.scaleX;
      const longitude = (gpsLongSeries[0][i] + mapScale.offsetY) / mapScale.scaleY;
      const x = canvasOffsetX + latitude  * (canvasScale - margin);
      const y = canvasOffsetY + longitude * (canvasScale - margin);
      if (currentZoom != null && i >= currentZoom[0] && i <= currentZoom[1])
          ctx.fillStyle = "blue";
      else
          ctx.fillStyle = "black";
      ctx.fillRect(x, y, 1, 1);
  }
  if (position != null) {
    const latitude = (gpsLatSeries[0][position] + mapScale.offsetX) / mapScale.scaleX;
    const longitude = (gpsLongSeries[0][position] + mapScale.offsetY) / mapScale.scaleY;
    const x = canvasOffsetX + latitude  * (canvasScale - margin);
    const y = canvasOffsetY + longitude * (canvasScale - margin);

    ctx.beginPath();
    ctx.arc(x, y, 3, 0, 2 * Math.PI, false);
    ctx.fillStyle = 'green';
    ctx.fill();
 }
}

function boolToString(value)
{
    return value ? boolEnabled : boolDisabled;
}
function stringToBool(value)
{
    return (value == boolEnabled ? true : false)
}

function saveConfig() {
    window.localStorage.setItem("settings", JSON.stringify(settings));
}
function loadConfig() {
    if (window.localStorage.getItem("settings")) {
        settings = JSON.parse(window.localStorage.getItem("settings"))
    }
}

function applySettings() {
    document.getElementById('speed_container').style.display = stringToBool(settings.speedChart) ? 'block' : 'none'
    document.getElementById('speedConfig').checked = stringToBool(settings.speedChart)
    document.getElementById('brake_container').style.display = stringToBool(settings.brakeChart) ? 'block' : 'none'
    document.getElementById('brakeConfig').checked = stringToBool(settings.brakeChart)
    document.getElementById('throttle_container').style.display = stringToBool(settings.throttleChart) ? 'block' : 'none'
    document.getElementById('throttleConfig').checked = stringToBool(settings.throttleChart)
    document.getElementById('throttleBrake_container').style.display = stringToBool(settings.throttleBrakeChart) ? 'block' : 'none'
    document.getElementById('throttleBrakeConfig').checked = stringToBool(settings.throttleBrakeChart)
    document.getElementById('speedDelta_container').style.display = stringToBool(settings.speedDeltaChart) ? 'block' : 'none'
    document.getElementById('speedDeltaConfig').checked = stringToBool(settings.speedDeltaChart)
    document.getElementById('brakeDelta_container').style.display = stringToBool(settings.brakeDeltaChart) ? 'block' : 'none'
    document.getElementById('brakeDeltaConfig').checked = stringToBool(settings.brakeDeltaChart)
    document.getElementById('throttleDelta_container').style.display = stringToBool(settings.throttleDeltaChart) ? 'block' : 'none'
    document.getElementById('throttleDeltaConfig').checked = stringToBool(settings.throttleDeltaChart)
    document.getElementById('timeDelta').style.display = stringToBool(settings.timeDeltaChart) ? 'block' : 'none'
    document.getElementById('timeDeltaConfig').checked = stringToBool(settings.timeDeltaChart)
    document.getElementById('gear_container').style.display = stringToBool(settings.gearChart) ? 'block' : 'none'
    document.getElementById('gearConfig').checked = stringToBool(settings.gearChart)
    document.getElementById('swa_container').style.display = stringToBool(settings.swaChart) ? 'block' : 'none'
    document.getElementById('swaConfig').checked = stringToBool(settings.swaChart)
    document.getElementById('damper_container').style.display = stringToBool(settings.damperChart) ? 'block' : 'none'
    document.getElementById('damperConfig').checked = stringToBool(settings.damperChart)
    if (settings.chartSize == "XXlarge") {
        resizeGraphHeight(chartXXLargeSize);
        document.getElementById('smallChartSize').className = "dropdown-item";
        document.getElementById('mediumChartSize').className = "dropdown-item";
        document.getElementById('largeChartSize').className = "dropdown-item";
        document.getElementById('XlargeChartSize').className = "dropdown-item";
        document.getElementById('XXlargeChartSize').className = "dropdown-item active";
    } else if (settings.chartSize == "Xlarge") {
        resizeGraphHeight(chartXLargeSize);
        document.getElementById('smallChartSize').className = "dropdown-item";
        document.getElementById('mediumChartSize').className = "dropdown-item";
        document.getElementById('largeChartSize').className = "dropdown-item";
        document.getElementById('XlargeChartSize').className = "dropdown-item active";
        document.getElementById('XXlargeChartSize').className = "dropdown-item";
    } else if (settings.chartSize == "large") {
        resizeGraphHeight(chartLargeSize);
        document.getElementById('smallChartSize').className = "dropdown-item";
        document.getElementById('mediumChartSize').className = "dropdown-item";
        document.getElementById('largeChartSize').className = "dropdown-item active";
        document.getElementById('XlargeChartSize').className = "dropdown-item";
        document.getElementById('XXlargeChartSize').className = "dropdown-item";
    } else if (settings.chartSize == "medium") {
        resizeGraphHeight(chartMediumSize);
        document.getElementById('smallChartSize').className = "dropdown-item";
        document.getElementById('mediumChartSize').className = "dropdown-item active";
        document.getElementById('largeChartSize').className = "dropdown-item";
        document.getElementById('XlargeChartSize').className = "dropdown-item";
        document.getElementById('XXlargeChartSize').className = "dropdown-item";
    } else {
        resizeGraphHeight(chartSmallSize);
        document.getElementById('smallChartSize').className = "dropdown-item active";
        document.getElementById('mediumChartSize').className = "dropdown-item";
        document.getElementById('largeChartSize').className = "dropdown-item";
        document.getElementById('XlargeChartSize').className = "dropdown-item";
        document.getElementById('XXlargeChartSize').className = "dropdown-item";
    }
}

function createChart(container, title, yAxisTitle, chartSelectionFunction, dataSeries, plotZeroLine) {
      zeroLineConfig =  [{ value: 0, color: 'black', width: 2, zIndex: 3}]
      return Highcharts.chart(container, {
        chart: { zoomType: 'x', events: { selection: chartSelectionFunction}, spacingBottom: 0, spacingTop: 0},
        credits: { enabled: false},
        title: { text: title, align: 'left' },
        tooltip: { shared: true},
        xAxis: { type: 'linear', crosshair: { color: 'green', dashStyle: 'solid' }},
        yAxis: { title: { text: yAxisTitle }, tickPixelInterval: 20, minPadding: 0.01,
                 maxPadding: 0.01, tickPosition: "inside" , plotLines: (plotZeroLine ? zeroLineConfig : [])},
        legend: { enabled: false },
	    alignTicks: false,
        series: dataSeries
    });
}
function hideContent() {
    document.getElementById('summaryMap').style.display = 'none'
    document.getElementById('charts').style.display = 'none'
    document.getElementById('spinner').style.display = 'block'

}
                      
function displayData(data) {
   telemetryData = data;
   parseTelemetryData(data)
   document.getElementById('summaryMap').style.display = 'block'
   document.getElementById('charts').style.display = 'block'
   document.getElementById('spinner').style.display = 'none'

   speedChart = createChart('speed_container', 'Speed', 'Speed (km/h)', speedChartSelection, speedSeries, false);
   throttleChart = createChart('throttle_container', 'Throttle', 'Throttle percentage', throttleChartSelection, throttleSeries, false);
   brakeChart = createChart('brake_container', 'Brake', 'Brake pressure', brakeChartSelection, brakeSeries, false);
   throttleBrakeChart = createChart('throttleBrake_container', 'Throttle + Brake', 'Value', throttleBrakeChartSelection, throttleBrakeSeries, false);
   swaChart = createChart ('swa_container', 'Steering Wheel Angle', 'Angle', swaChartSelection, swaSeries, true);
   damperChart = createChart ('damper_container', 'Damper Position', 'Damper', damperChartSelection, damperSeries, false);
   gearChart = createChart('gear_container', 'Gear', 'Gear', gearChartSelection, gearSeries, false);
                
   if (speedSeries.length == 2) {
     speedDeltaChart = createChart('speedDelta_container', 'Speed delta (reference = ' + telemetryData.laps[0].name + ')',
                                   'Cumulated Delta', speedDeltaChartSelection,
                                   [ { name: 'Cumulated Delta', type: 'line', tooltip: { valueDecimals: 0},
                                       point: { events: { mouseOver: speedDeltaChartMouseOver, mouseOut: speedDeltaChartMouseOut}},
                                       data: computeDeltaSurface(speedSeries[1].data, speedSeries[0].data) } ], false)
      throttleDeltaChart = createChart('throttleDelta_container', 'Throttle delta (reference = ' + telemetryData.laps[0].name + ')',
                                       'Cumulated Delta', throttleDeltaChartSelection,
                                        [ { name: 'Cumulated Delta', type: 'line', tooltip: { valueDecimals: 0},
                                            point: { events: { mouseOver: throttleDeltaChartMouseOver, mouseOut: throttleDeltaChartMouseOut}},
                                            data: computeDeltaSurface(throttleSeries[1].data, throttleSeries[0].data) } ], false)
      brakeDeltaChart = createChart('brakeDelta_container', 'Brake delta (reference = ' + telemetryData.laps[0].name + ')',
                                    'Cumulated Delta', brakeDeltaChartSelection,
                                     [ { name: 'Cumulated Delta', type: 'line', tooltip: { valueDecimals: 0},
                                         point: { events: { mouseOver: brakeDeltaChartMouseOver, mouseOut: brakeDeltaChartMouseOut}},
                                         data: computeDeltaSurface(brakeSeries[1].data, brakeSeries[0].data) } ], false)
      timeDeltaChart = createChart('timeDelta_container', 'Time delta (reference = ' + telemetryData.laps[0].name + ')',
                                   'Delta (second)', timeDeltaChartSelection,
                                   [ { name: 'Cumulated Delta', type: 'line', tooltip: { valueDecimals: 2},
                                   point: { events: { mouseOver: timeDeltaChartMouseOver, mouseOut: timeDeltaChartMouseOut}},
                                   data: timeDeltaData } ], true)
       timeSlipChart = createChart('timeSlip_container', 'Time slip (reference = ' + telemetryData.laps[0].name + ')',
                                    'Slip (second)', timeSlipChartSelection,
                                    [ { name: 'Slip', type: 'line', tooltip: { valueDecimals: 3},
                                    point: { events: { mouseOver: timeSlipChartMouseOver, mouseOut: timeSlipChartMouseOut}},
                                    data: timeSlipData } ], true)
        
    } else {
       document.getElementById('timeDelta').style.display = 'none'
       document.getElementById('speedDelta_container').style.display = 'none'
       document.getElementById('brakeDelta_container').style.display = 'none'
       document.getElementById('throttleDelta_container').style.display = 'none'
    }
                
    setSummaryContent();
    drawMap(null)

}
function clearList(list) {
  while (list.hasChildNodes()) {
      list.removeChild(list.firstChild);
  }
}

function updateBrowserURL() {
    // update URL
    const params = new URLSearchParams(window.location.search);
    params.set('driver', settings.driver)
    params.set('track', settings.track)
    params.set('date', settings.date)
    params.set('event', settings.event)
    window.location.search = params.toString();
}

function sessionMenuClic(e) {
    id = this.id;
    if (id.length > 8 && id.substring(0, 8) == 'session:') {
        pos = parseInt(id.substring(8))
        entry = baseEntries[pos]
        if (entry.driver == settings.driver && entry.track == settings.track && entry.date == settings.date && entry.event == settings.event) {
            // Clic on the current event
        } else {
            settings.driver = entry.driver
            settings.track = entry.track
            settings.date = entry.date
            settings.event = entry.event
            settings.car = entry.car
            settings.desc = entry.desc
            saveConfig();
            updateBrowserURL();
            hideContent();
            fetch(baseEntries[pos].url).then((response) => response.json()).then((json) => displayData(json));
        }
    }
}
function driverMenuClic(e) {
    settings.driver = this.id;
    // Load the first session of this driver
    var found = false;
    for (i = 0; !found && i < baseEntries.length; ++i) {
        if (baseEntries[i].driver == this.id) {
            settings.date = baseEntries[i].date
            settings.event = baseEntries[i].event
            settings.track = baseEntries[i].track
            settings.car = baseEntries[i].car
            settings.desc = baseEntries[i].desc
            saveConfig();
            found = true;
            displayMenus();
            updateBrowserURL();
            hideContent();
            fetch(baseEntries[i].url).then((response) => response.json()).then((json) => displayData(json));
        }
    }
}
function addListEntry(list, textToDisplay, selected, id, click) {
  var li = document.createElement("li");
  var link = document.createElement("a");
  var text = document.createTextNode(textToDisplay);
  link.appendChild(text);
  link.href = "#";
  link.setAttribute("class", "dropdown-item")
  if (id != null)
    link.setAttribute("id", id)
  if (click != null)
    link.addEventListener("click", click)
  if (selected)
    link.setAttribute("class", "dropdown-item active");
  li.appendChild(link);
  list.appendChild(li);
  return li;
}
function addSubMenu(li) {
  var ul = document.createElement("ul");
  ul.setAttribute("class", "submenu dropdown-menu")
  li.appendChild(ul);
  return ul;
}
function displayMenus() {
    var driverList = document.getElementById("driverDropDownList");
    clearList(driverList);
    var drivers = {}
    for (i = 0; i < baseEntries.length; ++i) {
      drivers[baseEntries[i].driver] = 1
    }
    Object.keys(drivers).forEach(function (key) {
        addListEntry(driverList, key, key == settings.driver, key, driverMenuClic)
    })
    
    var sessionList = document.getElementById('sessionDropDownList');
     clearList(sessionList)
     var tracks = {}
     for (i = 0; i < baseEntries.length; ++i) {
         if (baseEntries[i].driver == settings.driver) {
            tracks[baseEntries[i].track] = 1
         }
     }
    Object.keys(tracks).forEach(function (key) {
        var li = addListEntry(sessionList, key, key == settings.track)
        ul = addSubMenu(li);
        for (i = 0; i < baseEntries.length; ++i) {
            if (baseEntries[i].driver == settings.driver && baseEntries[i].track == key) {
                addListEntry(ul, baseEntries[i].date + ' ' + baseEntries[i].event, baseEntries[i].date == settings.date && baseEntries[i].event == settings.event, 'session:' + i, sessionMenuClic)
            }
        }
    })
    // make it as accordion for smaller screens
    if (window.innerWidth < 992) {

      // close all inner dropdowns when parent is closed
      document.querySelectorAll('.navbar .dropdown').forEach(function(everydropdown){
        everydropdown.addEventListener('hidden.bs.dropdown', function () {
          // after dropdown is hidden, then find all submenus
            this.querySelectorAll('.submenu').forEach(function(everysubmenu){
              // hide every submenu as well
              //everysubmenu.style.display = 'none';
            });
        })
      });
        document.querySelectorAll('.dropdown-menu a').forEach(function(element){
            
            element.addEventListener('click', function (e) {
                e.stopPropagation();
                var nextEl = this.nextElementSibling;
                if(nextEl && nextEl.classList.contains('submenu')) {
                    //e.preventDefault();
                    if(nextEl.style.display == 'block'){
                        nextEl.style.display = 'none';
                    } else {
                        nextEl.style.display = 'block';
                    }
                    this.style.display = 'block';
                }
            });
        })
    };
}

document.addEventListener('DOMContentLoaded', function () {
    hideContent();
    base = new Airtable({ apiKey: 'patJgI1nadq27UoBY.c6ba5356a52c3b40232468deeaec4b03de7a8fade952f26284a808ad7c0c4be2' }).base('app2TznoMYSMoNc3j');

    // Get config from local storage
    loadConfig();
    // Parse query parameters
    const params = new URLSearchParams(window.location.search);
    if (params.has('driver'))
	  settings.driver = params.get('driver')
    if (params.has('track'))
	  settings.track = params.get('track')
    if (params.has('event'))
	  settings.event = params.get('event')
    if (params.has('date'))
       settings.date = params.get('date')
    // Apply the settings
    applySettings();

    base('Main').select({maxRecords: 5000, view: "Grid view"}).eachPage(function page(records, fetchNextPage) {
    // This function (`page`) will get called for each page of records.
    records.forEach(function(record) {
        var t = record.get('Telemetry');
        var url = null;
        for (i = 0; t != null && i < t.length; ++i) {
          if (t[i]['filename'] == 'telemetry.json')
              url = t[i]['url']
        }
        if (url != null && url.length > 0) {
            driver = record.get('DriverName')
            track = record.get('Track')
            date = record.get('Date')
            event = record.get('Event')
            baseEntries.push({date: date, driver: driver, url: url, track: track, event: event, car: record.get('Car'), desc: record.get('EventDescription')})
            if (settings.driver == driver &&
              settings.track == track &&
              settings.date == date &&
              settings.event == event) {
              settings.car = record.get('Car')
              settings.desc = record.get('EventDescription')
              fetch(url).then((response) => response.json()).then((json) => displayData(json));
          }
        }
     });
     // To fetch the next page of records, call `fetchNextPage`.
     // If there are more records, `page` will get called again.
     // If there are no more records, `done` will get called.
     fetchNextPage();
  }, function done(err) {
    // Checl if there is any error while fetching airtable content
    if (err) { console.error(err); return; }

    displayMenus();
  });

    document.getElementById('speedConfig').addEventListener('change', (event) => {
        var speedEnabled = event.currentTarget.checked
        document.getElementById('speed_container').style.display = speedEnabled ? 'block' : 'none'
        speedChart.reflow()
        settings.speedChart = boolToString(speedEnabled)
        saveConfig();
    })
    document.getElementById('brakeConfig').addEventListener('change', (event) => {
        var brakeEnabled = event.currentTarget.checked
        document.getElementById('brake_container').style.display = brakeEnabled ? 'block' : 'none'
        brakeChart.reflow()
        settings.brakeChart = boolToString(brakeEnabled)
        saveConfig();

    })
    document.getElementById('throttleConfig').addEventListener('change', (event) => {
        var throttleEnabled = event.currentTarget.checked
        document.getElementById('throttle_container').style.display = throttleEnabled ? 'block' : 'none'
        throttleChart.reflow()
        settings.throttleChart = boolToString(throttleEnabled)
        saveConfig();
    })
    document.getElementById('throttleBrakeConfig').addEventListener('change', (event) => {
        var throttleBrakeEnabled = event.currentTarget.checked
        document.getElementById('throttleBrake_container').style.display = throttleBrakeEnabled ? 'block' : 'none'
        throttleBrakeChart.reflow()
        settings.throttleBrakeChart = boolToString(throttleBrakeEnabled)
        saveConfig();
    })
    document.getElementById('speedDeltaConfig').addEventListener('change', (event) => {
        var speedDeltaEnabled = event.currentTarget.checked
        document.getElementById('speedDelta_container').style.display = speedDeltaEnabled ? 'block' : 'none'
        speedDeltaChart.reflow()
        settings.speedDeltaChart = boolToString(speedDeltaEnabled)
        saveConfig();
    })
    document.getElementById('brakeDeltaConfig').addEventListener('change', (event) => {
        var brakeDeltaEnabled = event.currentTarget.checked
        document.getElementById('brakeDelta_container').style.display = brakeDeltaEnabled ? 'block' : 'none'
        brakeDeltaChart.reflow()
        settings.brakeDeltaChart = boolToString(brakeDeltaEnabled)
        saveConfig();
    })
    document.getElementById('throttleDeltaConfig').addEventListener('change', (event) => {
        var throttleDeltaEnabled = event.currentTarget.checked
        document.getElementById('throttleDelta_container').style.display = throttleDeltaEnabled ? 'block' : 'none'
        throttleDeltaChart.reflow()
        settings.throttleDeltaChart = boolToString(throttleDeltaEnabled)
        saveConfig();
    })
    document.getElementById('timeDeltaConfig').addEventListener('change', (event) => {
        var timeDeltaEnabled = event.currentTarget.checked
        document.getElementById('timeDelta').style.display = timeDeltaEnabled ? 'block' : 'none'
        timeDeltaChart.reflow()
        settings.timeDeltaChart = boolToString(timeDeltaEnabled)
        saveConfig();
    })
    document.getElementById('gearConfig').addEventListener('change', (event) => {
        var gearEnabled = event.currentTarget.checked
        document.getElementById('gear_container').style.display = gearEnabled ? 'block' : 'none'
        gearChart.reflow()
        settings.gearChart = boolToString(gearEnabled)
        saveConfig();
    })
    document.getElementById('swaConfig').addEventListener('change', (event) => {
        var swaEnabled = event.currentTarget.checked
        document.getElementById('swa_container').style.display = swaEnabled ? 'block' : 'none'
        swaChart.reflow()
        settings.swaChart = boolToString(swaEnabled)
        saveConfig();
    })
    document.getElementById('damperConfig').addEventListener('change', (event) => {
        var damperEnabled = event.currentTarget.checked
        document.getElementById('damper_container').style.display = damperEnabled ? 'block' : 'none'
        damperChart.reflow()
        settings.damperChart = boolToString(damperEnabled)
        saveConfig();
    })
    document.getElementById('smallChartSize').onclick = function() {
        resizeGraphHeight(chartSmallSize);
        document.getElementById('smallChartSize').className = "dropdown-item active";
        document.getElementById('mediumChartSize').className = "dropdown-item ";
        document.getElementById('largeChartSize').className = "dropdown-item ";
        document.getElementById('XlargeChartSize').className = "dropdown-item";
        document.getElementById('XXlargeChartSize').className = "dropdown-item";
        settings.chartSize = "small"
        saveConfig();
    }
    document.getElementById('mediumChartSize').onclick = function() {
        resizeGraphHeight(chartMediumSize);
        document.getElementById('smallChartSize').className = "dropdown-item ";
        document.getElementById('mediumChartSize').className = "dropdown-item active";
        document.getElementById('largeChartSize').className = "dropdown-item ";
        document.getElementById('XlargeChartSize').className = "dropdown-item";
        document.getElementById('XXlargeChartSize').className = "dropdown-item";
        settings.chartSize = "medium"
        saveConfig();
    }
    document.getElementById('largeChartSize').onclick = function() {
        resizeGraphHeight(chartLargeSize);
        document.getElementById('smallChartSize').className = "dropdown-item ";
        document.getElementById('mediumChartSize').className = "dropdown-item ";
        document.getElementById('largeChartSize').className = "dropdown-item active";
        document.getElementById('XlargeChartSize').className = "dropdown-item";
        document.getElementById('XXlargeChartSize').className = "dropdown-item";
        settings.chartSize = "large"
        saveConfig();
    }
    document.getElementById('XlargeChartSize').onclick = function() {
        resizeGraphHeight(chartXLargeSize);
        document.getElementById('smallChartSize').className = "dropdown-item ";
        document.getElementById('mediumChartSize').className = "dropdown-item ";
        document.getElementById('largeChartSize').className = "dropdown-item";
        document.getElementById('XlargeChartSize').className = "dropdown-item active";
        document.getElementById('XXlargeChartSize').className = "dropdown-item";
        settings.chartSize = "Xlarge"
        saveConfig();
    }
    document.getElementById('XXlargeChartSize').onclick = function() {
        resizeGraphHeight(chartXXLargeSize);
        document.getElementById('smallChartSize').className = "dropdown-item ";
        document.getElementById('mediumChartSize').className = "dropdown-item ";
        document.getElementById('largeChartSize').className = "dropdown-item";
        document.getElementById('XlargeChartSize').className = "dropdown-item";
        document.getElementById('XXlargeChartSize').className = "dropdown-item active";
        settings.chartSize = "XXlarge"
        saveConfig();
    }
});

