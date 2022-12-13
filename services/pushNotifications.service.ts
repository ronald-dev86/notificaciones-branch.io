
import oneSignal from 'onesignal-cordova-plugin';
import { BehaviorSubject } from 'rxjs';
import * as globals from '../app/globals'
export class PushNotificationsService {

  device: BehaviorSubject <string> = new BehaviorSubject( null )
  notificationBody: BehaviorSubject <string> = new BehaviorSubject(null)



  constructor(){}

  initPushNotification(platform){
  platform.ready().then(()=>{
      if(!platform.is('cordova')) return

      console.log('appid',globals.oneSignalAppId)
      oneSignal.setAppId(globals.oneSignalAppId);
      this.setDeviceState()

      oneSignal.setNotificationOpenedHandler((jsonData) => {
        if(!jsonData) return
        this.notificationBody.next(JSON.stringify(jsonData.notification.additionalData))
      });
    })

  }

  setDeviceState(){
    oneSignal.getDeviceState(dvc => {
      if(!dvc.userId) return this.setDeviceState()
      console.log('setDeviceState',dvc)
      this.device.next(JSON.stringify(dvc))
    })
  }

  getDeviceState(){
    return this.device.asObservable()
  }

  getnotificationBody(){
    return this.notificationBody.asObservable()
  }



}