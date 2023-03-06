#!/usr/bin/ruby
require 'csv'

class Lap
  def initialize(lap, import, name, startTime)
    @_lap = lap
    @_startTime = startTime
    @_endTime = startTime
    @_toImport = import
    @_name = name
    @_hash = {}
    @_maxDist = 0
  end

  def import?
    return @_toImport
  end
  
  def add(time, distance, speed, gear, rpm, throttle, brake, swa, damper, gpsLat, gpsLong)
    @_endTime = time
    if distance > @_maxDist
      @_maxDist = distance
    end
    distanceString = distance.to_s
    if @_hash.has_key?(distanceString)
      @_hash[distanceString].add(time - @_startTime, speed, gear, rpm, throttle, brake, swa, damper, gpsLat, gpsLong)
    else
      @_hash[distanceString] = DistanceData.new(time - @_startTime, speed, gear, rpm, throttle, brake, swa, damper, gpsLat, gpsLong)
    end
    if time > @_endTime
      @_endTime = time
    end
  end
  def name
    return @_name
  end
  def getData
    return @_hash
  end
  def getMaxDist
    return @_maxDist
  end
  def getLapTime
    sec = @_endTime - @_startTime
    return "%02d:%02d:%02d" % [sec / 60, sec % 60, (sec * 100) % 100]
  end
end

class DistanceData

  def initialize(time, speed, gear, rpm, throttle, brake, swa, damper, gpsLat, gpsLong)
      @_count = 1
      @_time = time
      @_speed = speed
      @_gear = gear_to_d(gear)
      @_rpm = rpm
      @_throttle = throttle
      @_brake = brake
      @_swa = swa
      @_damper = damper
      @_lat = gpsLat
      @_long = gpsLong
  end

  def gear_to_d(gear)
    if (gear == " FIRST") then
      return 1
    elsif gear == " SECOND" then
      return 2
    elsif gear == " THIRD" then
      return 3
    elsif gear == " FOURTH" then
      return 4
    elsif gear == " FIFTH" then
      return 5
    elsif gear == " SIXTH" then
      return 6
    elsif gear == " NEUTRAL" then
      return 0
    else
      puts "ERROR GEAR CONV: %s" % gear
      return 0
    end
  end
  
  def add(time, speed, gear, rpm, throttle, brake, swa, damper, gpsLat, gpsLong)
    @_count += 1
    @_time += time
    @_speed += speed
    @_gear += gear_to_d(gear)
    @_rpm += rpm
    @_throttle += throttle
    @_brake += brake
    @_swa += swa
    @_damper += damper
    @_lat += gpsLat
    @_long += gpsLong
  end

  def getTime
    return @_time / @_count
  end
  def getSpeed
    return @_speed / @_count
  end
  def getGear
    return @_gear / @_count
  end
  def getRPM
    return @_rpm / @_count
  end
  def getThrottle
    return @_throttle / @_count
  end
  def getBrake
    return @_brake / @_count
  end
  def getSWA
    return @_swa / @_count
  end
  def getDamper
    return @_damper / @_count
  end
  def getLat
    return @_lat / @_count
  end
  def getLong
    return @_long / @_count
  end
end

if ARGV.size < 2 || ARGV.size % 2 != 0
  raise "Usage: parse.rb Filename1 Name1 [Filename2 Name2]*"
end

# parsing...
laps = {}
refDist = 0
i = 0
lap = 0
while i < ARGV.size do
  name = ARGV[i + 1]
  fd = File.open(ARGV[i], "r")
  fd.readline # skip name of original LRD
#  fd.readline # skip frequency
#  fd.readline # skip empty line
  lap = lap + 1
  csv = CSV.new(fd.read, :headers => true)
  csv.each do |row|
    distanceKey = ' distance_LV'
    distanceFactor = 1000
    speedKey = ' vehicleSpeed'
    timeKey = 'Time'
    gearKey = ' gear'
    swaKey = ' swa'
    throttleKey = ' ppsA'
    brakeKey = ' bpf'
    rpmKey = ' rpm'
    damperKey = ' frDamper'
    
    if !row.has_key?(distanceKey)
      distanceKey = ' lapDistance'
      distanceFactor = 1
    end
    if !row.has_key?(distanceKey)
      raise "Cannot find distance channel"
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

    dist = (row[distanceKey].to_f * distanceFactor).to_i

    if not laps.has_key?(lap)
      laps[lap] = Lap.new(lap, true, name, row[timeKey].to_f)
      refDist = dist
    end
    laps[lap].add(row[timeKey].to_f, dist - refDist, row[speedKey].to_f, row[gearKey], row[rpmKey].to_i, row[throttleKey].to_f, row[brakeKey].to_f, row[swaKey].to_f, row[damperKey].to_f, row[' gpsLat'].to_f / 60.0, row[' gpsLong'].to_f / 60.0)
  end
  fd.close()
  i += 2
end

#display results
out = File.open("telemetry.json", "w")
out.write("{")
out.write("\"dataFormat\": \"DTSgtbsxyd\",");
out.write ("\"laps\": [");
firstLap=true
laps.each do | lap, v |
  if v.import?
    if (!firstLap)
      out.write(",")
    end
    firstLap = false
    out.write("{\"name\":\"%s\",\"data\":[" % v.name) 
    firstData=true
    v.getData.each do | dist, data|
      if firstData
        out.write("[")
      else
        out.write(",[")
      end
      out.write("%d,%.3f,%.1f,%d,%.1f,%.1f,%.2f,%f,%f,%2f" % [dist, data.getTime, data.getSpeed, data.getGear, data.getThrottle, data.getBrake, data.getSWA, data.getLat, data.getLong, data.getDamper])
      out.write("]")
      firstData = false
    end
    out.write("]}")
  end
  puts "lap:%d time:%s dist:%d  imported:%s" % [lap, v.getLapTime, v.getMaxDist, v.import?.to_s]
end
out.write("]}")
out.close()
