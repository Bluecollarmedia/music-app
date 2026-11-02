Pod::Spec.new do |s|
  s.name           = 'SonderAudio'
  s.version        = '1.0.0'
  s.summary        = 'SONDER native audio engine (AVAudioEngine playback, EQ, crossfade, gapless, system media integration).'
  s.description    = s.summary
  s.author         = 'SONDER'
  s.homepage       = 'https://github.com/Bluecollarmedia/music-app'
  s.license        = 'MIT'
  s.platforms      = { :ios => '26.0' }
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.swift_version  = '5.9'
  s.source_files   = '**/*.{h,m,swift}'
  s.frameworks     = 'AVFoundation', 'MediaPlayer', 'AVKit', 'ImageIO'
end
