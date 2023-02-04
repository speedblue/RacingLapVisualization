// Scan the array and remplace empty values by the most accurate value (averrage of left + right values)
function normalizeValues(array) {
    // Fill left
    left = 0;
    while (left < array.length && array[left] == null)
        ++left;
    if (left < array.length) {
        for (i = 0; i < left; ++left)
            array[i] = array[left]
    }
    // Fill right
    right = array.length - 1;
    while (right > 0 && array[right] == null)
        --right;
    if (right > 0) {
        for (i = right + 1; i < array.length; ++i)
            array[i] = array[right];
    }
    for (i = 0; i < array.length; ++i) {
        if (array[i] == null) {
            console.assert(i > 0, "null at left side of array")
            console.assert(array[i - 1] != null, "null at previous position of array")

            firstEl = i;
            left = i - 1;
            while (i < array.length && array[i] == null) ++i;
            right = i;
            
            console.assert(i < array.length, "null at right side of array")
            console.assert(array[i] != null, "null at next position of array")
            gap = (array[right] - array[left]) / (right - left)

            for (j = firstEl; j < i; ++j) {
                array[j] = array[j - 1] + gap;
            }
        }
   }
}

speedSeries = []
throttleSeries = []
brakeSeries = []
gearSeries = []
timeSeries = []
swaSeries = []

maxDist = 0
for (const lap of telemetry.laps) {
    for (const d of lap.data) {
        if (d[0] > maxDist) {
            maxDist = d[0] + 1
        }
    }
}
for (const lap of telemetry.laps) {
    time = Array(maxDist).fill(null)
    speed = Array(maxDist).fill(null)
    gear = Array(maxDist).fill(null)
    throttle = Array(maxDist).fill(null)
    brake = Array(maxDist).fill(null)
    swa = Array(maxDist).fill(null)
    
    for (const d of lap.data) {
        time[d[0]] = d[1]
        speed[d[0]] = d[2]
        gear[d[0]] = d[3]
        throttle[d[0]] = d[4]
        brake[d[0]] = d[5]
        swa[d[0]] = d[6]
    }
    normalizeValues(time)
    normalizeValues(speed)
    normalizeValues(gear)
    normalizeValues(throttle)
    normalizeValues(brake)
    normalizeValues(swa)

    speedObj = {data: [], name: lap.name, type: 'line', tooltip: {valueDecimals:1}}
    throttleObj = {data: [], name: lap.name, type: 'line', tooltip: {valueDecimals:1}}
    brakeObj = {data: [], name: lap.name, type: 'line', tooltip: {valueDecimals:1}}
    swaObj = {data: [], name: lap.name, type: 'line', tooltip: {valueDecimals:1}}
    gearObj = {data: [], name: lap.name, type: 'line', tooltip: {valueDecimals:1}}
    for (i = 0; i < maxDist; ++i) {
        speedObj.data.push([i, speed[i]])
        throttleObj.data.push([i, throttle[i]])
        brakeObj.data.push([i, brake[i]])
        swaObj.data.push([i, swa[i]])
        gearObj.data.push([i, gear[i]])
    }
    speedSeries.push(speedObj)
    throttleSeries.push(throttleObj)
    brakeSeries.push(brakeObj)
    gearSeries.push(gearObj)
    swaSeries.push(swaObj)
    timeSeries.push(time)
}

Highcharts.setOptions({
    colors: [ '#50B432', '#ED561B', '#DDDF00', '#24CBE5', '#64E572',
             '#FF9655', '#FFF263', '#6AF9C4']
});

speedChart = null;
throttleChart = null;
swaChart = null;
brakeChart = null;
gearChart = null;

speedDeltaChart = null;
throttleDeltaChart = null;
brakeDeltaChart = null;
timeDeltaChart = null;

currentZoom = null;

function metersToKm(value) {
    return Math.floor(value / 1000) + '.' + Math.floor(value % 1000) + ' km';
}
function displayLapTime(lapData) {
    lastEl = lapData[lapData.length - 1]
    timeInSec = lastEl[1]
    return Math.floor(timeInSec / 60) + ':' + (Math.floor(timeInSec) % 60) + '.' + (Math.floor(timeInSec * 100) % 100);
}

function setSummaryContent() {
    value = telemetry.trackName + '</br>' + metersToKm(maxDist) + '</br>' + telemetry.date + '</br>' + telemetry.event + '</br>' +
            telemetry.laps[0].name + ' in ' + displayLapTime(telemetry.laps[0].data) + '</br>' +
            telemetry.laps[1].name + ' in ' + displayLapTime(telemetry.laps[1].data) + '</br>';
    if (currentZoom == null) {
        value += 'Full Track';
    } else {
        value += metersToKm(currentZoom[0]) + ' to ' + metersToKm(currentZoom[1]);
    }
    document.getElementById('rightSummaryDiv').innerHTML = value;
}

function updateOneChartZoom(srcChart, dstChart, min, max) {
    
    reset = (min == null && max == null)
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
    updateOneChartZoom(srcChart, brakeChart, min, max)
    updateOneChartZoom(srcChart, gearChart, min, max)
    updateOneChartZoom(srcChart, swaChart, min, max)
    updateOneChartZoom(srcChart, speedDeltaChart, min, max)
    updateOneChartZoom(srcChart, throttleDeltaChart, min, max)
    updateOneChartZoom(srcChart, brakeDeltaChart, min, max)
    updateOneChartZoom(srcChart, timeDeltaChart, min, max)
    setSummaryContent()
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
function swaChartSelection(event) { applyChartSelection(swaChart, event) }
function brakeChartSelection(event) { applyChartSelection(brakeChart, event) }
function gearChartSelection(event) { applyChartSelection(gearChart, event) }
function speedDeltaChartSelection(event) { applyChartSelection(speedDeltaChart, event) }
function throttleDeltaChartSelection(event) { applyChartSelection(throttleDeltaChart, event)}
function brakeDeltaChartSelection(event) { applyChartSelection(brakeDeltaChart, event)}
function timeDeltaChartSelection(event) { applyChartSelection(timeDeltaChart, event)}

document.addEventListener('DOMContentLoaded', function () {
    speedChart = Highcharts.chart('speed_container', {
        chart: { zoomType: 'x', events: { selection: speedChartSelection} },
        title: { text: 'Speed', align: 'left' },
        xAxis: { type: 'linear' },
        yAxis: { title: { text: 'Speed (km/h)' } },
        legend: { enabled: false },
        series: speedSeries
    });

    throttleChart = Highcharts.chart('throttle_container', {
    chart: { zoomType: 'x', events: { selection: throttleChartSelection} },
        title: { text: 'Throttle', align: 'left' },
        xAxis: { type: 'linear' },
        yAxis: { title: { text: 'Throttle percentage' } },
        legend: { enabled: false },
        series: throttleSeries
    });

    swaChart = Highcharts.chart('swa_container', {
        chart: { zoomType: 'x', events: { selection: swaChartSelection}  },
        title: { text: 'Steering Wheel Angle', align: 'left' },
        xAxis: { type: 'linear' },
        yAxis: { title: { text: 'Angle' } },
        legend: { enabled: false },
        series: swaSeries
    });

    brakeChart = Highcharts.chart('brake_container', {
        chart: { zoomType: 'x', events: { selection: brakeChartSelection} },
        title: { text: 'Brake', align: 'left' },
        xAxis: { type: 'linear' },
        yAxis: { title: { text: 'Brake pressure' } },
        legend: { enabled: false },
        series: brakeSeries
    });

    gearChart = Highcharts.chart('gear_container', {
        chart: { zoomType: 'x', events: { selection: gearChartSelection} },
        title: { text: 'Gear', align: 'left' },
        xAxis: { type: 'linear' },
        yAxis: { title: { text: 'Gear' } },
        legend: { enabled: false },
        series: gearSeries
    });
});

function computeDeltaSurface(data1, data2) {
    data = []
    delta = 0.0
    for (i = 0; i < data1.length; ++i) {
        delta += data1[i][1] - data2[i][1]
        data.push([i, delta]);
    }
    return data;
}

// Display Delta charts
if (speedSeries.length == 2) {
    timeDeltaData = []
    for (i = 0; i < maxDist; ++i) {
        delta = timeSeries[0][i] - timeSeries[1][i]
        delta = Math.floor(delta * 100) / 100.0
        timeDeltaData.push(delta)
    }
    
    // reduce noise in timeDeltaData by checking at 20m area and removing small spikes than less than 0.1s
    for (i = 0; i < timeDeltaData.length; ++i) {
        found = 0;
        for (j = 1; j < 20 && (i + j) < timeDeltaData.length; ++j) {
            if (timeDeltaData[i] == timeDeltaData[i + j]) {
                found = j;
            }
        }
        if (found > 0) {
            for (j = 1; j < found; ++j) {
                if (Math.abs(timeDeltaData[i + j] - timeDeltaData[i]) < 0.1)
                    timeDeltaData[i + j] = timeDeltaData[i]
            }
        }
    }
	
    document.addEventListener('DOMContentLoaded', function () {
	
        speedDeltaChart = Highcharts.chart('speedDelta_container', {
            chart: { zoomType: 'x', events: { selection: speedDeltaChartSelection} },
            title: { text: 'Speed delta (reference = ' + telemetry.laps[1].name + ')', align: 'left' },
            xAxis: { type: 'linear' },
            yAxis: { title: { text: 'Delta (km/h)' } },
            legend: { enabled: false },
            series: [ { name: 'Cumulated Delta', type: 'line', tooltip: { valueDecimals: 0},
                        data: computeDeltaSurface(speedSeries[0].data, speedSeries[1].data) } ]
        });
	
        throttleDeltaChart = Highcharts.chart('throttleDelta_container', {
            chart: { zoomType: 'x', events: { selection: throttleDeltaChartSelection} },
            title: { text: 'Throttle delta (reference = ' + telemetry.laps[1].name + ')', align: 'left' },
            xAxis: { type: 'linear' },
            yAxis: { title: { text: 'Delta' } },
            legend: { enabled: false },
            series: [ { name: 'Cumulated Delta', type: 'line', tooltip: { valueDecimals: 0},
                        data: computeDeltaSurface(throttleSeries[0].data, throttleSeries[1].data) } ]
        });
        
        brakeDeltaChart = Highcharts.chart('brakeDelta_container', {
            chart: { zoomType: 'x', events: { selection: brakeDeltaChartSelection} },
            title: { text: 'Brake delta (reference = ' + telemetry.laps[1].name + ')', align: 'left' },
            xAxis: { type: 'linear' },
            yAxis: { title: { text: 'Delta' } },
            legend: { enabled: false },
            series: [ { name: 'Cumulated Delta', type: 'line', tooltip: { valueDecimals: 0},
                        data: computeDeltaSurface(brakeSeries[0].data, brakeSeries[1].data) } ]
        });
        
        timeDeltaChart = Highcharts.chart('timeDelta_container', {
            chart: { zoomType: 'x', events: { selection: timeDeltaChartSelection} },
            title: { text: 'Time delta (reference = ' + telemetry.laps[1].name + ')', align: 'left' },
            xAxis: { type: 'linear' },
            yAxis: { title: { text: 'Delta (second)' } },
            legend: { enabled: false },
            series: [ { name: 'Cumulated Delta', type: 'line', tooltip: { valueDecimals: 0}, data: timeDeltaData } ]
        });
        
    });
} else {
    document.addEventListener('DOMContentLoaded', function () {
        document.getElementById('timeDelta_container').style.display = 'none'
        const deltaCheckbox = document.getElementById('delta_config')
        deltaCheckbox.disabled = true;
    });
}

navigationIncrement = 50;
window.onload = function (){
    eventHandler = function (e) {
        if (currentZoom == null)
            return;
        if (e.keyCode == 37 && currentZoom[0] > navigationIncrement) {
            updateAllChartZoom(null, currentZoom[0] - navigationIncrement, currentZoom[1] - navigationIncrement);
        }
        if (e.keyCode == 39 && currentZoom[1] + navigationIncrement < maxDist) {
            updateAllChartZoom(null, currentZoom[0] + navigationIncrement, currentZoom[1] + navigationIncrement);
        }
    }
  window.addEventListener('keydown', eventHandler, false);
}
                          
document.addEventListener('DOMContentLoaded', function () {
    setSummaryContent();
    const stbCheckbox = document.getElementById('stb_config')
    stbCheckbox.addEventListener('change', (event) => {
        if (event.currentTarget.checked) {
            document.getElementById('speed_container').style.display = 'block'
            document.getElementById('brake_container').style.display = 'block'
            document.getElementById('throttle_container').style.display = 'block'
        } else {
            document.getElementById('speed_container').style.display = 'none'
            document.getElementById('brake_container').style.display = 'none'
            document.getElementById('throttle_container').style.display = 'none'
        }
    })

    const deltaCheckbox = document.getElementById('delta_config')
    deltaCheckbox.addEventListener('change', (event) => {
        if (event.currentTarget.checked) {
            document.getElementById('speedDelta_container').style.display = 'block'
            document.getElementById('brakeDelta_container').style.display = 'block'
            document.getElementById('throttleDelta_container').style.display = 'block'
            document.getElementById('timeDelta_container').style.display = 'block'
        } else {
            document.getElementById('speedDelta_container').style.display = 'none'
            document.getElementById('brakeDelta_container').style.display = 'none'
            document.getElementById('throttleDelta_container').style.display = 'none'
            document.getElementById('timeDelta_container').style.display = 'none'
        }
    })

    const gearCheckbox = document.getElementById('gear_config')
    gearCheckbox.addEventListener('change', (event) => {
        if (event.currentTarget.checked) {
            document.getElementById('gear_container').style.display = 'block'
        } else {
            document.getElementById('gear_container').style.display = 'none'
        }
    })

    const swaCheckbox = document.getElementById('swa_config')
    swaCheckbox.addEventListener('change', (event) => {
        if (event.currentTarget.checked) {
            document.getElementById('swa_container').style.display = 'block'
        } else {
            document.getElementById('swa_container').style.display = 'none'
        }
    })

});

