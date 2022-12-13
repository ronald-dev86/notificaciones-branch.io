import {Component, ViewChild, Output, EventEmitter} from '@angular/core';
import {App, Nav, Platform, Events, ToastController, NavController, LoadingController} from 'ionic-angular';
import {StatusBar} from '@ionic-native/status-bar';
import {SplashScreen} from '@ionic-native/splash-screen';
import { AngularFireAuth } from '@angular/fire/auth';
import {Config} from 'ionic-angular';
import {NativeAudio} from '@ionic-native/native-audio';
import * as globals from './globals';
import {Keyboard} from '@ionic-native/keyboard';
import oneSignal from 'onesignal-cordova-plugin';
import {Storage}from'@ionic/storage';


//Translation
import {TranslateService} from 'ng2-translate'
import {UserService} from '../services/user.service';
import {UtilService} from "../services/util.service";
import {NovedadService} from '../services/novedad.service';
import {Util} from '../pages/admin-items/util/util';
import { Badge } from '@ionic-native/badge';


//Services

import { StorageDataTypes } from '../commons/content-types';
import {ListComponentsProvider}from '../services/list-components'
import {ConfigService} from  '../services/config.service'
import { ConnectionStatusService } from '../services/connection-status.service';
import { Roles } from '../commons/roles';
import { RolAccessService } from '../services/rolAccess.service';
import { StorageService } from '../services/storage.service';
import { interval } from 'rxjs/observable/interval';
import { ChatProvider } from '../services/chat/chat/chat';
import { GrupoService } from '../services/grupo.service';
import { RolesMenuService } from '../services/roles-menu.service';
import { CheckBuildVersionService } from '../services/checkBuildVersion.service';
import { Subscription } from 'rxjs';
import { AppStateService } from '../services/app-state.service';
import { DbService } from '../services/database/database.service';
import { PushNotificationsService } from '../services/pushNotifications.service';
import { tap } from 'rxjs/operators';


declare var cordova;

@Component({
  templateUrl: 'app.html'
})
export class MyApp {
  tab;
  @ViewChild(Nav) nav: Nav;
  @Output() log = new EventEmitter<string>();

  rootPage: any;
  centered = false;
  branchInitiaized = false;
  timeOutOcurred = false;
  firebaseTokenSubscription: Subscription;
  branchRedirect;
  windowOpen: any = null;
  isLoggedIn;
  visible;
  appInitiaized = false;

  constructor(public platform: Platform,
              public statusBar: StatusBar,
              public splashScreen: SplashScreen,
              public config: Config,
              private translateService: TranslateService,
              public userService: UserService,
              private util: Util,
              private utilService: UtilService,
              public novedadService: NovedadService,
              private keyboard: Keyboard,
              public  app: App,
              public nativeAudio: NativeAudio,
              private rolAccess: RolAccessService,
              private connectionStatus: ConnectionStatusService,
              private storage: Storage,
              private storageService: StorageService,
              private listComponent:ListComponentsProvider,
              private configService: ConfigService,
              public chat: ChatProvider/*iniciamos el chat desde el constructor para tener los escuchas globales*/,
              public grupoService: GrupoService,
              private afAuth: AngularFireAuth,
              private rolesMenuService: RolesMenuService,
              public toast: ToastController,
              private checkBuildService: CheckBuildVersionService,
              private appStateService: AppStateService,
              private dbService: DbService,
              private events: Events,
              public pushService: PushNotificationsService,
              public loadingCtrl: LoadingController) {

    //let loading = this.util.loading();
    this.visible = true;
    this.events.subscribe('block-tab-menu', data => {
      this.visible = !data.block;
    });
    platform.ready().then(async () => {
      this.dbService.getReadyDB().subscribe(async (ready)=>{
        if(ready != 4) return;

        // validacion del build
        this.checkBuild().then(validBuild=>{
          if (!validBuild) {
            this.nav.setRoot('ForceUpdatePage').then(_ => this.events.publish('toggle-tab-menu', { hide: true }));;
          }
        });
        // inicializacion del firebase
        this.handleFirebaseSuscription();



        // subscripcion del status del token de firebase
        this.chat.tokenStatus.subscribe(async (validToken) => {
          const token = await this.storageService.getFBToken();
          if (!token) {
            return;
          }
          if (validToken === false) {
            // this.util.showMessage(this.translateService.instant('CHAT-CONNECTION-ERROR') + ' 11111', 5000);
            return;
          };
          try {
            await this.afAuth.auth.signInWithCustomToken(token);
            this.chat.updateLoggedInStatus(true);
          } catch (error) {
            this.chat.updateTokenStatus(false);
            this.chat.updateLoggedInStatus(false);
            console.error('ERROR CONEXION FIREBASE');
            console.error(error);
          }
        });
        // validacion del login de usuario
        this.utilService.isLoggedIn().then(async (isLoggedIn) => {
          this.isLoggedIn = isLoggedIn;
          if (isLoggedIn) {
            const user = await this.storageService.getUser();
            this.userService.setUserSubjectData(user);
          }
        });
        // escuchamos los datos del usuarios si cambian
        this.userService.getUserSubjectObservable().subscribe(async (user) => {
          if (user && !this.afAuth.auth.currentUser) {
            const chatReadyInterval = interval(100);
            const chatReadySubscription = chatReadyInterval.subscribe(() => {
              if (user && this.afAuth.auth.currentUser && !this.chat.connectedToDatabase) {
                this.chat.startChatEvents();
                chatReadySubscription.unsubscribe();
              }
            });
            return;
          }
          if (user && this.afAuth.auth.currentUser && !this.chat.connectedToDatabase) {
            this.chat.startChatEvents();
          }
        });
        // Intervalo para inicializacion del branch
        this.pushService.initPushNotification(platform)
        /*
         * subcripcion para la validacion de pushID del usuario no incluye el proceso de
         * login solo actuliza pushID con la session activa
         */
        this.pushService.getDeviceState().subscribe(async (device) => {
          pushIDValidated(this.userService, this.storageService, device)()
        })

        /*
         * subcripcion de accion de notificacion pendiente del callback del plugin de
         * Onesignal de cordova
         */
        this.pushService.getnotificationBody().subscribe((notification) => {
          if(!notification) return
          const payload =  JSON.parse(notification)
          this.processLocalNotification2(payload)

        })

        const stateClearerInterval = interval(300 * 1000);
        stateClearerInterval.subscribe( _ => {
          this.events.publish('clear-list', {
            type: StorageDataTypes.NOVEDADES_DATA
          });
          this.events.publish('clear-list', {
            type: StorageDataTypes.EVENTO_TYPE
          });
          this.events.publish('clear-list', {
            type: StorageDataTypes.GRUPOS_DATA
          });
          this.events.publish('clear-list', {
            type: StorageDataTypes.BENECICIOS_DATA
          });
          this.events.publish('clear-list', {
            type: StorageDataTypes.PODCASTS_DATA
          });
          this.events.publish('renew-user-data');
          this.rolesMenuService.get().subscribe(menu => {
            this.storageService.setMenu(menu);
            this.rolesMenuService.setMenuSubjectData(menu);
          });
        });
        // obtenemos el rol y lo guardamos en el storage
        this.rolesMenuService.get().subscribe(menu => {
          this.storageService.setMenu(menu);
        });
        // *******************eventos*******************
        this.events.subscribe('tokenExpired', async (data) => {
          console.log('token expired triggered !!!!');
          this.chat.stopAllEvents();
          this.events.publish('toggle-tab-menu', { hide: true });
          const page = this.listComponent.returnComponentTypeLogin(globals.typeLogin);
          this.nav.setRoot(page).then(async () => {
            if (!localStorage.getItem('redirect_branch')) {
              await this.storage.clear();
              if (!localStorage.getItem('message_sent')) {
                if (!data || !data.hideMessage) {
                  this.util.showMessage(this.translateService.instant('SESSION-EXPIRED'), 4500);
                }
                localStorage.setItem('message_sent', '1');
                setTimeout(() => {
                  localStorage.removeItem('message_sent');
                }, 4500);
              }
            }
          });
        });
        this.events.subscribe("HttpError", async () => {
          // this.util.showMessage(this.translateService.instant('CHAT-CONNECTION-ERROR'), 3000);
        });
        this.events.subscribe('login', async (data) => {
          localStorage.removeItem('redirect_branch');
          const loading = this.util.loading();
          // this.configService.refrescherConfig();
          try {
            const dni = data.dni ? data.dni : null;
            await this.storage.set('id_token', data.token);
            const userData = await this.userService.getUserData(data.email, dni).toPromise();
            loading.dismiss();
            await this.storage.set(StorageDataTypes.USER_INFO, userData);
            this.userService.setUserSubjectData(userData);
            await this.storage.set('lang', 1);
            if (userData && userData.idioma != null) {
              this.utilService.setTranslationsLanguage(userData.idioma.codigo);
              await this.storage.set('lang', userData.idioma.id);
            }
            const acess_levels = await this.userService.lisTypeUser().toPromise();
            this.storage.set('acess_levels', acess_levels);

            /**
             * En caso de que ya tengamos una sesion abierta con Firebase, la cerramos
             */
            this.chat.stopAllEvents();
            await this.chat.startChatEvents();
            const config = await this.configService.getConfig();
            console.log('L255---> config:', config)

            this.pushService.getDeviceState().subscribe(async (device) => {
            pushIDValidated(this.userService, this.storageService, device)()
            })

            console.log('navegacion')
            if (config.update_profile_interests_registration_page && userData.update_interests== 0){
              this.nav.setRoot('InteresesPage', {rootPage: true});
              return;
            }
            this.nav.setRoot('HomePage');
            console.log("***********272*************");
          } catch (error) {
            console.error(error);
            loading.dismiss();
          }
        });
        this.events.subscribe('logout', async (data) => {
          localStorage.clear();

          //salvar las variables necesarias para el regitro e iniico de sesion y luego volver a guaradrlar post borrado
          this.storage.clear().then((done)=>{
          });

          await this.dbService.savedTableConfigStorage();

          this.chat.stopAllEvents();

          switch (data.typeLogin) {
            case "ieem":
              this.nav.setRoot('IeemLoginPage');
              break;
            case "linkedin":
              this.nav.setRoot('LoginLinkedinPage');
              break;
            case "normal":
              this.nav.setRoot('LoginPage');
              break;
            case "iae":
              this.nav.setRoot('LoginIAEPage');
              break;
          }
        });
        this.events.subscribe('tab-navigation', data => {


          if (this.rootPage === data.tab)
            return;

          if (data.id)
            this.storageService.setDetailsContentNavigationByComponentes(data.tab, data.id, this.rootPage)
          this.rootPage = data.tab;
        });
        this.events.subscribe('clear-list', async (data) => {
          await this.storageService.clearList(StorageDataTypes.HOME_DATA);
          await this.storageService.clearList(data.type);
        });
        this.events.subscribe('clear-detail', async (data) => {
          this.storageService.clearDetail(data.type);
        });
        this.events.subscribe('clear-admin-content-type', async _ => {
          this.storage.set('admin-content-type', '');
        });
        this.events.subscribe('clear-chat-data', async _ => {
          await this.storage.set('chat-data', null);
          await this.storage.set('pageChatActive', false);
        });
        this.events.subscribe('renew-user-data', async _ => {
          const user = await this.storage.get(StorageDataTypes.USER_INFO);
          if (!user) {
            return;
          }
          const userData = await this.userService.getUserData(user.email, user.dni).toPromise();
          await this.storage.set(StorageDataTypes.USER_INFO, userData);
          this.userService.setUserSubjectData(userData);
        });
        // *******************fin eventos*******************//
        /**
         * Connection Status
         */
        this.connectionStatus.initializeNetworkEvents();
        this.translateService.use(globals.forceLang);

        if (this.platform.is('ios')) {
          // all platforms
          this.config.set('scrollPadding', false);
          this.config.set('scrollAssist', false);
          this.config.set('autoFocusAssist', false);
        } else if (this.platform.is('android')) {
          this.config.set('scrollAssist', true);
          this.config.set('autoFocusAssist', 'delay');
        }
        if (platform.is('cordova')) {

          const infoBranchApp =  await branchManagement(this.platform, window['Branch'], this.appStateService)()
          console.log('L352----->',infoBranchApp)
          this.branchInit(infoBranchApp);

        } else {
          const infoBranchWeb = await branchManagement(this.platform, (window as any).branch, this.appStateService)()
          console.log('L357----->',infoBranchWeb)
          this.branchInit(infoBranchWeb);

        }
        this.splashScreen.hide();
        this.keyboard.hideFormAccessoryBar(false);
        this.statusBar.overlaysWebView(false);
        if (globals.statusStyle == 'light') {
          this.statusBar.styleLightContent();
        } else if (globals.statusStyle == 'dark') {
          this.statusBar.styleDefault();
        }
        this.statusBar.backgroundColorByHexString(globals.statusBarBackgroundColor);
        nativeAudio.preloadSimple('messageReceived', 'assets/audio/messageReceived.mp3');
        nativeAudio.preloadSimple('messageSent', 'assets/audio/messageSent.mp3');

      })
    });
    platform.resume.subscribe(async () => {
      const branchResume =  await branchManagement(this.platform, window['Branch'], this.appStateService)();
      this.branchInit(branchResume);
    });
  }

  async redireccionDelHome(isAnonimous){
    /***************************** Inicilizacion del branch en el home */
    let jsonData: any = JSON.parse(localStorage.getItem('redirect_branch'));
    console.log(jsonData);
    this.branchRedirect = jsonData !== null || jsonData !== undefined;
    localStorage.removeItem('redirect_branch');
    if (jsonData) {

      let loading = this.util.loading();
      if (jsonData['type'] == 'share-link') {
        switch (jsonData['page']) {
          case 'NovedadPage':
            await this.storageService.setNovedadDetailId(jsonData['page-id']);
            this.nav.setRoot('NovedadPage');
            break;
          case 'GrupoPage':
            await this.storageService.setGrupoDetailId(jsonData['page-id']);
            this.nav.setRoot('GrupoPage');
            break;
          case 'PromosDetailPage':
            await this.storageService.setBeneficioDetailId(jsonData['page-id']);
            this.nav.setRoot('PromosDetailPage');
            break;
          case 'EventoPage':
            await this.storageService.setEventoDetailId(jsonData['page-id']);
            this.nav.setRoot('EventoPage');
            break;
          case 'PodcastPage':
            await this.storageService.setPodcastDetailId(jsonData['page-id']);
            this.nav.setRoot('PodcastsDetailPage');
            break;
        }
        this.util.loadingClose(loading);
        return;
      }
      if (jsonData['type'] === 'event-inscription-form-link') {
        await this.storageService.setEventoDetailId(jsonData['page-id']);
        isAnonimous ? this.nav.setRoot('EventoInscriptionFormPage') : this.nav.setRoot('EventoPage');
        this.util.loadingClose(loading);
        return;
      }
      if (jsonData['page'] == 'ChatPage') {
        await this.storageService.setChatData({
          nombre: jsonData.nombreUser,
          id: jsonData.idUser,
          fromBranch: true,
          chatGrupo: false
        });
        this.nav.setRoot('ChatroomPage');
        this.util.loadingClose(loading);
        return;
      } else if (jsonData['page'] == 'ChatGroup') {

        this.grupoService.get(jsonData.chatRoom).subscribe(async (p) => {
          this.util.loadingClose(loading);
          await this.storageService.setChatData({
            nombre: p.titulo,
            chatGrupo: true,
            chatRoom: p.chat_room,
            idGrupo: p.id,
            previousPage: 'GrupoPage',
            descripcion: p.descripcion,
            image: p.imagen,
            members: this.getMembersIngroupToFirebase(p),
            id_admin: p["id_admin"]
          });
          this.nav.setRoot('GrouproomPage');
        }, error => {
          this.util.loadingClose(loading);
          this.util.showMessage(this.translateService.instant('GROUP-CHAT-CONNECTION-ERROR'), 3000);
        })
        return;
      } else if (jsonData['page'] == 'NovedadPage') {
        await this.storageService.setNovedadDetailId(jsonData.novedad.id);
        this.nav.setRoot('NovedadPage');
        this.util.loadingClose(loading);
        return;
      }
    }
    console.log("***********648*************");
    this.nav.setRoot('HomePage');
    //************************************************** Fin branch en home */
  }

  async handleFirebaseSuscription(requestNewToken = true) {
    if (this.firebaseTokenSubscription) {
      this.firebaseTokenSubscription.unsubscribe();
    }
    let firebaseNewTokenOk = true;
    if (requestNewToken) {
      firebaseNewTokenOk = await this.setFirebaseToken();
    }
    this.chat.updateTokenStatus(firebaseNewTokenOk);
    // let firebaseTokenIntervalTime = firebaseNewTokenOk ? 2400 * 1000 : 60 * 1000;
    let firebaseTokenIntervalTime = firebaseNewTokenOk ? 300 * 1000 : 60 * 1000;
    let firebaseTokenInterval = interval(firebaseTokenIntervalTime);
    this.firebaseTokenSubscription = firebaseTokenInterval.subscribe( async _ => {
      firebaseNewTokenOk = await this.setFirebaseToken();
      this.chat.updateTokenStatus(firebaseNewTokenOk);
      if (firebaseNewTokenOk && firebaseTokenIntervalTime === 60 * 1000) {
        this.handleFirebaseSuscription(false);
        return;
      }
      // if (!firebaseNewTokenOk && firebaseTokenIntervalTime === 2400 * 1000) {
      if (!firebaseNewTokenOk && firebaseTokenIntervalTime === 300 * 1000) {
        this.handleFirebaseSuscription(true);
        return;
      }
    });
  }

  async setFirebaseToken() {
    try {
      const response: any = await this.configService.getFirebaseToken().toPromise();
      await this.storageService.setFBToken(response.token)
      return true;
    } catch (error) {
      return false;
    }
  }

  async checkBuild() {
    return await this.checkBuildService.checkVersion();
  }

  async autoLoginBranch(data) {
    console.log('L507---->',data)
    let loading = this.util.loading();
    console.log('data.token-->',data.token)
    await this.storage.set('id_token', data.token);
    const userData = await this.userService.getMyData().toPromise();
    this.storage.set(StorageDataTypes.USER_INFO, userData);
    this.util.loadingClose(loading);
    return userData;
  }

  async getEventsRegistered() {
    const user = await this.storage.get(StorageDataTypes.USER_INFO);
    this.userService.getEventsRegistered(user.id).subscribe(r => {
      if (r.length == 0)
        this.nav.push('AddEventPage');
      else if (r.length == 1) {
        localStorage.setItem("id_evento", r[0].id);
        this.nav.push('EventoPage');
      } else {
        console.log("***********734*************");
        this.nav.setRoot('HomePage');
      }
    });

  }


  async initializeApp() {
    console.log('estoy en initializeApp')
    this.appInitiaized = true;
    const isLoggedIn = await this.utilService.isLoggedIn();
    if (!isLoggedIn) {
      this.redirecTypeLogin();
      return;
    }
    let userData = await this.storage.get(StorageDataTypes.USER_INFO);
    if (!userData) {
      userData = JSON.parse(localStorage.getItem(StorageDataTypes.USER_INFO)); // esto se necesita para el manejo de branch en el ambiente WEB
      await this.storage.set(StorageDataTypes.USER_INFO, userData);
    }
    let token = await this.storage.get('id_token');
    if (!token) {
      token = localStorage.getItem('id_token'); // esto se necesita para el manejo de branch en el ambiente WEB
      await this.storage.set('id_token', token);
    }
    /**
     * Rol 6 is anonimous
     */

    const isAnonimous = await this.rolAccess.isRol(Roles.ANONIMO);
    if (this.platform.is('cordova') && isAnonimous) {
      this.redirecTypeLogin();
      return;
    }
    await this.storage.set('lang', 1);
    if (userData && userData.idioma != null) {
      this.utilService.setTranslationsLanguage(userData.idioma.codigo);
      await this.storage.set('lang', userData.idioma.id);
    }
    const config = await this.storage.get('config');
    if (config.update_profile_interests_registration_page && userData.update_interests == 0 && !this.branchInitiaized){
      this.nav.setRoot('InteresesPage', {rootPage: true});
      return;
    }
    if (this.nav.last() == undefined) {
      this.rootPage = 'HomePage';
      return;
    }

  }
  async processLocalNotification2(jsonData) {
    if (!jsonData) {
      return;
    }
    if(this.windowOpen){
      this.windowOpen.close()
    }
    if(jsonData.link){
      this.windowOpen = window.open(jsonData.link,'_blank');
    }
    const validBuild = await this.checkBuild();
    if (!validBuild) {
      this.nav.setRoot('ForceUpdatePage');
      return;
    }
    if(jsonData.page == 'HomePage'){
      this.events.publish('toggle-tab-menu', { hide: false })
      console.log("***********866*************");
      this.rootPage = 'HomePage';
      return;
    }
    this.events.publish('toggle-tab-menu', { hide: true });
    if (jsonData.page == 'EventoPage') {
      await this.storageService.setEventoDetailId(jsonData['id_evento']);
      this.nav.setRoot('EventoPage', {
        aditionalData: jsonData
      });
      return;
    } else if (jsonData.page == 'ChatPage') {
      const pageChatActive = await this.storage.get('pageChatActive');
      if (pageChatActive && this.nav.getActive() !== undefined) {
        this.nav.remove(this.nav.getActive().index);
      }

      await this.storageService.setChatData({
        nombre: jsonData.nombreUser,
        id: jsonData.idUser,
        chatGrupo: false,
        previousPage: 'HomePage'
      });
      this.nav.setRoot('ChatroomPage');
      return

    } else if (jsonData.page == 'ChatGrupo') {

      const pageChatActive = await this.storage.get('pageChatActive');
      if (pageChatActive && this.nav.getActive() !== undefined) {
        this.nav.remove(this.nav.getActive().index);
      }
      const loading = await this.util.loading();
      this.grupoService.get(jsonData.id_grupo).subscribe(async (p) => {
        this.util.loadingClose(loading);
        await this.storageService.setChatData({
          nombre: p.titulo,
          chatGrupo: true,
          chatRoom: p.chat_room,
          previousPage:'HomePage',
          idGrupo: p.id,
          descripcion: p.descripcion,
          image: p.imagen,
          members: this.getMembersIngroupToFirebase(p),
          id_admin: p["id_admin"]
        });
        this.nav.setRoot('GrouproomPage');
        return;
      }, error => {
        this.util.loadingClose(loading);
        this.util.showMessage(this.translateService.instant('GROUP-CHAT-CONNECTION-ERROR'), 3000);
      });

    } else if (jsonData.page == 'NovedadPage') {
      await this.storageService.setNovedadDetailId(jsonData.id_novedad);
      this.nav.setRoot('NovedadPage');
      return;
    } else if (jsonData.page == 'ItemAgendaPage') {
      //await this.storageService.setEventoDetailId(jsonData.id_evento);
      await this.storageService.setAgendaItemDetailId(jsonData.id_item, StorageDataTypes.EVENTO_TYPE, jsonData.id_evento);
      console.log('jsonData',jsonData)
      this.nav.setRoot('AgendaItemPage');
      return;
    } else if (jsonData.page == 'OradorPage') {
      await this.storageService.setOradorDetailId(jsonData.id_expositor, jsonData.id_evento);
      this.nav.setRoot('OradorPage');
      return;
    } else if (jsonData.page == 'EncuestaPage') {
      await this.storageService.setEncuestaDetailId(jsonData.id_encuesta, jsonData.evento);
      this.nav.setRoot('EncuestaPage');
      return;
    } else if (jsonData.page == 'PromosDetailPage') {
      await this.storageService.setBeneficioDetailId(jsonData.details.id);
      this.nav.setRoot('PromosDetailPage');
      return;
    }
  }

  redirecTypeLogin() {
    if (this.nav.last() && this.nav.last().name === 'WelcomeFromLinkedinPage') {
      return;
    }
    if (this.nav.getActive() && this.nav.getActive().component.name === 'CompanySignupPage') {
      return;
    }
    this.rootPage = this.listComponent.returnComponentTypeLogin(globals["typeLogin"]);
  }


  async branchInit(data) {
    console.log('Procesamiento de data de branch');
    console.log('data L684--->', data);
    console.log('this.appInitiaized --->',this.appInitiaized)
    if(!data && !this.appInitiaized){
      console.log('antes de initializeApp ---> branchInit')
      await this.initializeApp()
      console.log('despues de initializeApp ---> branchInit')
      return;
    }else if(!data && this.appInitiaized){
      return;
    }
    let loading = this.util.loading();

    /**
     * valido session.
     */

    const isLoggedIn = await this.utilService.isLoggedIn();
    console.log('isLoggedIn',isLoggedIn)

    if (!isLoggedIn) {
      const user: any = await this.autoLoginBranch(data);
      this.utilService.setTranslationsLanguage(globals.forceLang);
      await this.storage.set('lang', user.id_idioma);
    }

    const userData = await this.storageService.getUser();
    console.log('session--->', userData);

    const validBuild = await this.checkBuild();
    console.log('validBuild',validBuild)
    if (!validBuild) {
      this.nav.setRoot('ForceUpdatePage');
      return;
    }
    this.appInitiaized = true;
    if (data['type'] === 'event-inscription-form-link') {
      const isAnonimous = await this.rolAccess.isRol(Roles.ANONIMO);
      await this.storageService.setEventoDetailId(data['page-id']);
      console.log('info branch--->',data)
      console.log('isAnonimo', isAnonimous)

     if(isAnonimous){
      this.util.loadingClose(loading);
      this.rootPage = 'EventoInscriptionFormPage';
      return
     }
    }
    console.log('proceso de redireccion---->', data['page'])
    switch (data['page']) {
          case 'NovedadPage':
            await this.storageService.setNovedadDetailId(data['page-id']);
            this.util.loadingClose(loading);
            this.nav.setRoot('NovedadPage');
            break;
          case 'GrupoPage':
            await this.storageService.setGrupoDetailId(data['page-id']);
            this.util.loadingClose(loading);
            this.nav.setRoot('GrupoPage');
            break;
          case 'PromosDetailPage':
            await this.storageService.setBeneficioDetailId(data['page-id']);
            this.util.loadingClose(loading);
            this.nav.setRoot('PromosDetailPage');
            break;
          case 'EventoPage':
            await this.storageService.setEventoDetailId(data['page-id']);
            this.util.loadingClose(loading);
            this.nav.setRoot('EventoPage');
            break;
          case 'PodcastPage':
            await this.storageService.setPodcastDetailId(data['page-id']);
            this.util.loadingClose(loading);
            this.nav.push('PodcastsDetailPage');
            break;
          case 'ChatPage':
            await this.storageService.setChatData({
              nombre: data.nombreUser,
              id: data.idUser,
              fromBranch: true,
              chatGrupo: false
            });
            this.util.loadingClose(loading);
            this.nav.setRoot('ChatroomPage');
            break;
          case 'ChatGroup':
            try {
              const p = await this.grupoService.get(data.chatRoom).toPromise()
              await this.storageService.setChatData({
                nombre: p.titulo,
                chatGrupo: true,
                chatRoom: p.chat_room,
                idGrupo: p.id,
                previousPage: 'GrupoPage',
                descripcion: p.descripcion,
                image: p.imagen,
                members: this.getMembersIngroupToFirebase(p),
                id_admin: p["id_admin"]
              });
              this.util.loadingClose(loading);
              this.nav.setRoot('GrouproomPage');
            } catch (error) {
              this.util.loadingClose(loading);
              this.util.showMessage(this.translateService.instant('GROUP-CHAT-CONNECTION-ERROR'), 3000);
            }
            break;
    }



    /*if (data['type'] === 'share-link') {
      console.log('share-link')
      const isLoggedIn = await this.utilService.isLoggedIn();
      console.log('isLoggedIn',isLoggedIn)
      if (!isLoggedIn) {
        console.log("**************************************************")
        console.log(data)
        const user: any = await this.autoLoginBranch(data);
        console.log(user);
        console.log("**************************************************")
        if (user && user.idioma && 'codigo' in user.idioma) {
          this.utilService.setTranslationsLanguage(user.idioma.codigo);
          await this.storage.set('lang', user.idioma.id);
        }else{
          this.utilService.setTranslationsLanguage("es");
          await this.storage.set('lang', user.id_idioma);
        }
        const validBuild = await this.checkBuild();
        if (!validBuild) {
          this.nav.setRoot('ForceUpdatePage');
          return;
        }
        switch (data['page']) {
          case 'NovedadPage':
            await this.storageService.setNovedadDetailId(data['page-id']);
            this.nav.setRoot('NovedadPage');
            break;
          case 'GrupoPage':
            await this.storageService.setGrupoDetailId(data['page-id']);
            this.nav.setRoot('GrupoPage');
            break;
          case 'PromosDetailPage':
            await this.storageService.setBeneficioDetailId(data['page-id']);
            this.nav.setRoot('PromosDetailPage');
            break;
          case 'EventoPage':
            await this.storageService.setEventoDetailId(data['page-id']);
            this.nav.setRoot('EventoPage');
            break;
          case 'PodcastPage':
            await this.storageService.setPodcastDetailId(data['page-id']);
            this.nav.push('PodcastsDetailPage');
            break;
          case 'ChatPage':
            console.log('chat redirecionar L784')
            await this.storageService.setChatData({
              nombre: data.nombreUser,
              id: data.idUser,
              fromBranch: true,
              chatGrupo: false
            });
            this.nav.setRoot('ChatroomPage');
            this.util.loadingClose(loading);
            break;
        }
        return;
      }
      const validBuild = await this.checkBuild();
      console.log('validBuild',validBuild)
      if (!validBuild) {
        this.nav.setRoot('ForceUpdatePage');
        return;
      }
      let userData = await this.storage.get(StorageDataTypes.USER_INFO);
      const isAnonimous = this.rolAccess.isRol(Roles.ANONIMO);
      if (!isAnonimous) {
        localStorage.setItem('redirect_branch', JSON.stringify(data));
        // this.nav.setRoot('HomePage');
        this.redireccionDelHome(isAnonimous);
        return;
      }
      await this.storage.set('lang', 1);
      if (userData && userData.idioma != null) {
        this.utilService.setTranslationsLanguage(userData.idioma.codigo);
        await this.storage.set('lang', userData.idioma.id);
      }
      console.log('Page',data['page'])
      switch (data['page']) {
        case 'NovedadPage':
          await this.storageService.setNovedadDetailId(data['page-id']);
          this.nav.setRoot('NovedadPage');
          break;
        case 'GrupoPage':
          await this.storageService.setGrupoDetailId(data['page-id']);
          this.nav.setRoot('GrupoPage');
          break;
        case 'PromosDetailPage':
          await this.storageService.setBeneficioDetailId(data['page-id']);
          this.nav.setRoot('PromosDetailPage');
          break;
        case 'EventoPage':
          await this.storageService.setEventoDetailId(data['page-id']);
          this.nav.setRoot('EventoPage');
          break;
        case 'PodcastPage':
          await this.storageService.setPodcastDetailId(data['page-id']);
          this.nav.setRoot('PodcastsDetailPage');
          break;
        case 'ChatPage':
          await this.storageService.setChatData({
            nombre: data.nombreUser,
            id: data.idUser,
            fromBranch: true,
            chatGrupo: false
          });
          this.nav.setRoot('ChatroomPage');
          //this.util.loadingClose(loading);
          break;
      }
      return;
    } else if (data['type'] === 'event-inscription-form-link') {
      const validBuild = await this.checkBuild();
      if (!validBuild) {
        this.nav.setRoot('ForceUpdatePage');
        return;
      }
      const isLoggedIn = await this.utilService.isLoggedIn();
      if (!isLoggedIn) {
        const user: any = await this.autoLoginBranch(data['id_mail']);
        if (user && 'codigo' in user.idioma) {
          this.utilService.setTranslationsLanguage(user.idioma.codigo);
          await this.storage.set('lang', user.idioma.id);
        }
      }
      await this.storageService.setEventoDetailId(data['page-id']);
      const isAnonimous = await this.rolAccess.isRol(Roles.ANONIMO);
      isLoggedIn && !isAnonimous ? this.nav.setRoot('EventoPage'):this.rootPage = 'EventoInscriptionFormPage';
      return;
    }else{
      console.log('otro flujo de branch para chat')
    }
    localStorage.setItem('redirect_branch', JSON.stringify(data));
    const isLoggedIn = await this.utilService.isLoggedIn();
    let userData = await this.storage.get(StorageDataTypes.USER_INFO);
    if (!isLoggedIn || (userData && userData.id != data['idUser'])) {
      userData = await this.autoLoginBranch(data);
    }
    const config = await this.dbService.loadConfig(true);
    const validBuild = await this.checkBuild();
    if (!validBuild) {
      this.nav.setRoot('ForceUpdatePage');
      return;
    }
    if (config.update_profile_interests_registration_page && userData.update_interests== 0) {
      this.nav.setRoot('InteresesPage', {rootPage: true});
      return;
    }
    const isAnonimous = this.rolAccess.isRol(Roles.ANONIMO);
    this.redireccionDelHome(isAnonimous);
    return;*/
  }

  getMembersIngroupToFirebase(itemG){
    let members = itemG["miembros"].map(item => item.id_user);
    let ot = members.filter((item, index)=>{
      return members.indexOf(item) === index;
    })
    return ot;
  }
}

const pushIDValidated = ( userService, storageService, device) => async() =>{
  if(!device) return
  const pushDevice = JSON.parse(device)
  const user = await storageService.getUser()
  if(!user) return
  if(pushDevice.userId === user.push_id) return
  try {
    await userService.updatePushID(user.id, pushDevice.userId ).toPromise()
  } catch (error) {
    console.error(error)
  }
}
const branchManagement = (platform, branch, appStateService) => async() =>{
  return new Promise(async (resolve, reject) => {
    if (platform.is('cordova')) {
      try {
        console.log('manejo de branch para mobile')
        await branch.setDebug(true);
        await branch.setCookieBasedMatching(globals.bundleIdentifiersBranch);
        const branchInfo = await branch.initSession();
        appStateService.branchReady();
        if(branchInfo['+clicked_branch_link'] === true){
          console.log("debo de procesar un link de branch")
          resolve(branchInfo);
        }else{
          resolve(false)
        }
      } catch (error) {
        console.log('error', error)
        const logout = await branch.logout();
        console.log('logout',logout);
      }
    }else{
      branch.init(globals.branch_key, async (err, data) => {
        console.log('manejo de branch para web', data)
        if(err){
          console.log('error del branch',err);
          return
        }
        appStateService.branchReady();
        if(data.data_parsed['+clicked_branch_link'] === true){
          console.log("debo de procesar un link de branch")
          resolve(data.data_parsed);
        }else{
          resolve(false)
        }
      })
    }
  })
}
