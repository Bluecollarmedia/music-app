#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

/// Runs `block`, turning an Objective-C exception into an NSError instead of a crash.
/// AVAudioEngine reports some failures (for example starting a player whose engine
/// stopped while the app was in the background) by raising exceptions, which Swift
/// cannot catch on its own.
FOUNDATION_EXPORT BOOL SonderTryObjC(NS_NOESCAPE void (^block)(void), NSError *_Nullable *_Nullable error);

NS_ASSUME_NONNULL_END
