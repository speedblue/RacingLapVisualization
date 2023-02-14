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

if ARGV.size < 3 || ARGV.size % 3 != 0
  raise "Usage: parse.rb Filename1 lapNumber1 Name1 [Filename2 lapNumber2 Name2]*"
end

# parsing...
laps = {}
refDist = 0
i = 0
while i < ARGV.size do
  lapToImport = ARGV[i + 1].to_i
  name = ARGV[i + 2]
  CSV.foreach(ARGV[i], :headers => true) do |row|
    lap = (row[' lapCount'].to_i + i * 100).to_s
    dist = (row[' distance_LV'].to_f * 1000).to_i
    if not laps.has_key?(lap)
      laps[lap] = Lap.new(lap, lap.to_i == lapToImport, name, row['Time'].to_f)
      refDist = dist
    end
    laps[lap].add(row['Time'].to_f, dist - refDist, row[' vehicleSpeed'].to_f, row[' gear'], row[' rpm'].to_i, row[' ppsA'].to_f, row[' bpf'].to_f, row[' swa'].to_f, row[' frDamper'].to_f, row[' gpsLat'].to_f / 60.0, row[' gpsLong'].to_f / 60.0)
  end
  i += 3
end

#display results
out = File.open("output.js", "w")
out.write("telemetry = {")
out.write("trackName: \"TRACK\",")
out.write("car: \"CAR\",")
out.write("event: \"EVENT\",")
out.write("date: \"DATE\",")
out.write("dataFormat: \"DTSgtbsxyd\",");
out.write ("laps: [");
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
