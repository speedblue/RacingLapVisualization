#!/usr/bin/ruby
require 'csv'


if ARGV.size == 0
  raise "Usage: parse.rb Filename"
end

def valid_float?(value)
  return Float(value, exception: false) != nil
end

class Key
  def initialize(value, isFloat)
    if (isFloat)
      @_min = @_max = value.to_f
    else
      @_min = @_max = 0
    end
    @_hash = {}
    @_hash[value] = 1
  end
  def add(value, isFloat)
    if (@_hash.has_key?(value))
      @_hash[value] = @_hash[value] + 1
    else
      @_hash[value] = 1
    end
    if (isFloat)
      if value.to_f < @_min
        @_min = value.to_f
      end
      if value.to_f > @_max
        @_max = value.to_f
      end
    end
  end
  def getMin
    return @_min
  end
  def getMax
    return @_max
  end
  def getNbValues
    return @_hash.length
  end
  def printValues
    @_hash.each do | key, value |
      puts '    [' + key + '] Freq:' + value.to_s
    end
                       
  end
end

hash = {}
# parsing...
for i in 0..ARGV.size - 1 do
  fd = File.open(ARGV[i], "r")
  fd.readline # skip name of original LRD
  fd.readline # skip frequency
  fd.readline # skip empty line

  csv = CSV.new(fd.read, :headers => true)
  csv.each do |row|
    row.each do |key, value|

      if hash.has_key?(key)
        hash[key].add(value, valid_float?(value))
      else
        hash[key] = Key.new(value, valid_float?(value))
      end
    end
  end
end

hash.each do | key, value|
  puts key + ' min:' + value.getMin.to_s + ' max:' + value.getMax.to_s + ' nbValues:' + value.getNbValues.to_s
    if (value.getNbValues < 10)
      value.printValues
    end
end
