#!/usr/bin/ruby
require 'csv'


if ARGV.size < 1
  raise "Usage: parse.rb Filename"
end

distanceToMax = (160 + 35) # brake lap this number of meters before the max speed
maxSpeed = 205

# parsing...
prevSpeed = 0
detected = false
prevTime = 0
prevDist = 0
newDist = 0
lapsPositions = []
data = []

fd = File.open(ARGV[0], "r")
fd.readline # skip name of original LRD
fd.readline # skip frequency
fd.readline # skip empty line

csv = CSV.new(fd.read, :headers => true)
  
csv.each do |row|
    distanceKey = ' lapDistance'
    lapCountKey = ' lapCount'
    speedKey = ' vehicleSpeed'
    timeKey = 'Time'
    gearKey = ' gear'
    swaKey = ' swa'
    throttleKey = ' ppsA'
    brakeKey = ' bpf'
    rpmKey = ' rpm'
    damperKey = ' frDamper'
    
    if !row.has_key?(distanceKey)
      raise "Cannot find distance channel"
    end
    if !row.has_key?(distanceKey)
      raise "Cannot find distance channel"
    end
    if !row.has_key?(lapCountKey)
      raise "Cannot find lap count channel"
    end
    if !row.has_key?(timeKey)
      raise "Cannot find time channel"
    end
    if !row.has_key?(speedKey)
      speedKey = ' flSpeed'
    end
    if !row.has_key?(speedKey)
      raise "Cannot find speed channel"
    end
    if !row.has_key?(gearKey)
      raise "Cannot find gear channel"
    end
    if !row.has_key?(swaKey)
      raise "Cannot find SWA channel"
    end
    if !row.has_key?(throttleKey)
      raise "Cannot find Throttle channel"
    end
    if !row.has_key?(brakeKey)
      raise "Cannot find Brake channel"
    end
    if !row.has_key?(rpmKey)
      raise "Cannot find RPM channel"
    end
    if !row.has_key?(damperKey)
      raise "Cannot find damper channel"
    end

    dist = row[distanceKey].to_i
    if (dist < prevDist)
      # reset distance
      puts "dist:" + dist.to_s + ' prev:' + prevDist.to_s
      if (dist > 5000 && dist < 5010)
        newDist += (dist - 5000)
      else  
        newDist += 1
      end
    else
      delta = (dist - prevDist)
      if (delta > 1000)
        delta = 0
      end
      newDist += delta
    end
    if (!detected && row[speedKey].to_f > maxSpeed && (row[speedKey].to_f + 1) < prevSpeed)
      puts 'prevSpeed:' + prevSpeed.to_s + ' newSpeed:' + row[speedKey].to_s
      sec = row[timeKey].to_f - prevTime

      puts 'Detected Brake point(' + lapsPositions.length.to_s + '):' + row[timeKey] + ' ' + newDist.to_s + ' ' + row[speedKey] + ' time:' + ("%02d:%02d:%02d" % [sec / 60, sec % 60, (sec * 100) % 100])
      detected = true
      prevTime = row[timeKey].to_f
      lapsPositions.push(newDist - distanceToMax) # new lap detected!
    end
    if (row[speedKey].to_f < maxSpeed)
      detected = false
    end
    data.push({ dist: newDist, speed: row[speedKey], time: row[timeKey], throttle: row[throttleKey], brake: row[brakeKey], swa: row[swaKey], rpm: row[rpmKey], gear: row[gearKey], damper: row[damperKey]})
                
    prevSpeed = row[speedKey].to_f
    prevDist = dist

  end
  fd.close()

  lapsCount = Array.new(newDist + 1).fill(1)
lapsPositions[5] += 15
for i in 0..lapsPositions.length - 1 do
  pos = lapsPositions[i]
  if (i > 0)
    delta = pos - lapsPositions[i - 1]
  end
  lap = i + 2
  for j in pos..newDist do
    lapsCount[j] = lap
  end
end

fd = File.open(ARGV[0] + '.new', "w")
fd.write("first line - ignored\n")
fd.write("second line - ignored\n")
fd.write("third line - ignored\n")
fd.write("Time, lapDistance, lapCount, flSpeed, gear, swa, ppsA, bpf, rpm, frDamper\n")
for d in data do
  fd.write(d[:time] + ',' + d[:dist].to_s + ',' + lapsCount[d[:dist]].to_s + ',' + d[:speed] + ',' + d[:gear] + ',' + d[:swa] + ',' + d[:throttle] + ',' + d[:brake] + ',' + d[:rpm] + ',' + d[:damper] + "\n")
end
fd.close
