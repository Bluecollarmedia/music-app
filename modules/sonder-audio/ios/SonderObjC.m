#import "SonderObjC.h"

BOOL SonderTryObjC(NS_NOESCAPE void (^block)(void), NSError *_Nullable *_Nullable error) {
  @try {
    block();
    return YES;
  } @catch (NSException *exception) {
    if (error) {
      *error = [NSError errorWithDomain:@"SonderAudio"
                                   code:1
                               userInfo:@{
                                 NSLocalizedDescriptionKey : exception.reason ?: exception.name,
                               }];
    }
    return NO;
  }
}
