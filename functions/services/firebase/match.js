
const admin = require('firebase-admin');
const serviceAccount = require('../../serviceAccountKey.json');
const api_firebase_team = require('../firebase/team');
const moment = require('moment-timezone');
const { HLTV } = require('hltv');
const { ref } = require('firebase-functions/lib/providers/database');
admin.initializeApp({	
    credential: admin.credential.cert(serviceAccount),
    databaseURL: 'https://rusha-30776.firebaseio.com',
    storageBucket: 'gs://rusha-30776.appspot.com'
});
admin.firestore().settings({ ignoreUndefinedProperties: true });


const isMatchExists = async (id, status) => {     
    return await admin.database().ref('/matches/'+ status + '/' + id).once('value').then(function(snapshot) {
        return snapshot.exists();
    });
}

const formatObjMatch = async (item, updating = false) => {
    let today = moment().tz('America/Sao_Paulo').format('YYYY/MM/DD HH:mm');
    let match = { };
  
    match = {
        match_id  : item.id,
        date      : item.date ? moment(new Date( item.date )).tz('America/Sao_Paulo').format("YYYY/MM/DD HH:mm") : '' ,
        team1_id  : typeof item.team1.id === 'undefined' ?  ''  : item.team1.id  ,
        team2_id  : typeof item.team2.id === 'undefined' ?  '' : item.team2.id ,
        team1_name: item.team1  ? item.team1.name : '',
        team2_name: item.team2  ? item.team2.name : '',
        team1: item.team1  ? item.team1 : '',
        team2: item.team2  ? item.team2 : '',
        format    : item.format ? item.format : '',
        event_id  : typeof item.event.id === 'undefined' ? '' : item.event.id,
        title     : item.title ? item.title : '', 
        event_name: item.event.name === 'undefined'  ? '' : item.event.name,
        stars     : item.stars ? item.stars : '',
        live      : item.live ? item.live : false,   
        maps      : item.maps ?  JSON.parse(JSON.stringify(item.maps)) : '',
        match_over: false,	
        status : item.status ? item.status : false,  					
        updated_at: today       
    };

    if ( updating )
    {   
        let [team1, team2] = await Promise.all([api_firebase_team.getRankTeamMatch(matchHLTV.team1.id),
            api_firebase_team.getRankTeamMatch(matchHLTV.team2.id)]);

        //processo de captura de resultados				
        let gameTypeBestOf = matchHLTV.format.replace(/\D/g,'');		                
        let result = {};
        let maps = {};
        let map_current = item.live ? 'map1' : 'N/D';                

        for (let index = 0; index < gameTypeBestOf; index++) {                    
            let map = {};	
            if ( typeof matchHLTV.maps[index].result !== 'undefined') 
            {
                map.name = matchHLTV.maps[index].name;			
                map.result = matchHLTV.maps[index].result.substring(0, 5).replace('(', ''); 
                map.score_team1 = matchHLTV.maps[index].result.substring(0, 5).split(":")[0].replace(/\D/g,'');
                map.score_team2 = matchHLTV.maps[index].result.substring(0, 5).split(":")[1].replace(/\D/g,'');
                map.statsId = matchHLTV.maps[index].statsId;
                map.winner = null;
            }                                                

            let any_team_have_more_than_15_rounds = Number(map.score_team1) > 15 || Number(map.score_team2) > 15;
            
            //verifica se a partida tem algum time com score maior que 15						
            if ( any_team_have_more_than_15_rounds  )								
            {	//se houve match point alcançado a diferença vai maior que 1, ou seja: 2 
                if ( Math.abs(Number(map.score_team1) - Number(map.score_team2)) > 1 )
                {	//gravarei o vencedor! 
                    if ( Number(map.score_team1) > Number(map.score_team2) )
                    {
                        map.winner = { id: matchHLTV.team1.id, name: matchHLTV.team1.name }
                    }else {
                        map.winner = { id: matchHLTV.team2.id, name: matchHLTV.team2.name }
                    }
                    
                    map_current = 'map' + (+index + 2);
                }								
            }
            
            isNaN(map.score_team1, map.score_team2 ) ? map.finish = false : null;
            maps['map' + (+index + 1)] = JSON.parse( JSON.stringify(map));                        
        }	

        result.winnerTeam = matchHLTV.winnerTeam;
        result.maps = maps;
        result.match_id = matchHLTV.id;

        match.stats_id       = matchHLTV.statsId;
        match.result         = result;
        match.map_current    = map_current;
        match.validated_bets = false;
        match.team1 = team1;
        match.team2 = team2;
    }

    return match
}

const  store = async (matchHLTV) => {
    let [
        matchExistInLive,
        matchExistInFinish,
        matchFormatted
    ] = await Promise.all([
        isMatchExists(matchHLTV.id, 'live'),
        isMatchExists(matchHLTV.id, 'finish'),
        formatObjMatch(matchHLTV)
    ]);    
    
    await admin.database().ref('/matches/upcoming/' + matchFormatted.match_id).once('value').then( async function(snapshot) {							
        if ((!matchExistInLive && !matchExistInFinish) && (!snapshot.exists() && !matchFormatted.live)){  
            //inseri no banco a partida
            await admin.database()
            .ref('matches/upcoming/' + matchFormatted.match_id )
            .update(JSON.parse( JSON.stringify(matchFormatted) )).then( () => { 
                console.log(`Partida inserida com sucesso! `)   
            });    

        }else if( matchFormatted.live  && !matchExistInLive ){
            console.log('consultando partida live na hltv');
            console.log('STATUS: ' + matchFormatted.live)          
            //atualiza partida se n existir no status upcoming
            await update(matchFormatted.match_id, 'upcoming');
                                        
        }else if(snapshot.exists()){ 
            console.log('partida já existe no banco')
        }              																

    });	
}

async function update  (id, status_current = '' ) {
    matchHLTV = await HLTV.getMatch({id: id}).then((res) => {	        								
        return res;
    }).catch(error => {								
        console.log(error, 'Erro na função [module.exports.store] getMatch HLTV');
        response = false;	
    });		

    if ( matchHLTV )
    {		    
        let match = await formatObjMatch(matchHLTV, updating = true);
             
        switch (match.status.toLowerCase()) {
            case 'live':
                status = 'live';
                break;
            case 'scheduled':
                status = 'upcoming';
                break;
            case 'match over':
                status = 'finish';
                break;
            case 'match postponed':
                status = 'postponed';
                break;
            case 'match deleted':
                status = 'deleted';
                break;              
            default:
                break;
        }   

        let ref = '/matches/'+ status +'/' + id;
        
        await admin.database()
        .ref(ref)
        .update(JSON.parse( JSON.stringify(match))).then( async () => {
            if( status != status_current.toLocaleLowerCase() )
            {
                let ref = '/matches/'+ status_current.toLocaleLowerCase() +'/' + id;
               
                await admin.database()
                .ref(ref)
                .remove();
            }
        });                      
    }else {
        console.log('não encontrada partida na hltv')
    }
}

const getListMatches  = async (status, limit = 2) => { 
        return await admin.database().ref('/matches/' + status)
            .orderByChild('updated_at')
            .limitToFirst(limit)
            .once('value').then(async function (snapshot) {
                if (snapshot.exists()) {
                    return Object.entries(snapshot.val())
                }else {
                    return []
                }
            });
    }

const getListBetsMatchFinish  = async () => { 
        let now = moment().tz('America/Sao_Paulo').format('YYYY/MM/DD HH:mm');
        return  await admin.database().ref('/bets/opens')
                .orderByChild('date_match')
                .endAt(now)
                .once('value')
                .then(async function (betsSnap) {
                   
                    if (betsSnap.exists()) {
                        let arrayBetOpens = Object.entries(betsSnap.toJSON());                        

                        return arrayBetOpens;
                    }else {
                        return []
                    }
                });
    }

const getMatchDB  = async function(id, status)  {     
        return  await admin.database()
                .ref('/matches/'+ status +'/' + id)
                .once('value')
                .then(async function (matchSnap) {
            if (matchSnap.exists()) {
            
                let match = matchSnap.val();
                    
                return match;
            }else {
                return []
            }

        });
    }

const getMatchesUpcomingOldersDB = async function() {
    let sevenDayBefore = moment().tz('America/Sao_Paulo').subtract(7, 'day').format('YYYY/MM/DD');
	let today = moment().tz('America/Sao_Paulo').format('YYYY/MM/DD');
    return await admin.database().ref('/matches/upcoming')
    .orderByChild('date')
    .startAt(sevenDayBefore)
    .endAt(today)
    .limitToFirst(2)
    .once('value').then(async function (snapshot) {
        if (snapshot.exists()) {
            return Object.entries(snapshot.val())
        }else {
            return []
        }
    });
}


const getBetsOpens = async (match_id) => {
    return await admin.database().ref('/bets/opens').orderByChild('match_id').equalTo(Number(match_id))
        .once('value').then(function (snapBets) {
            
            if (snapBets.exists()) {
                return Object.entries(snapBets.val());
            } else {
                console.log('nenhuma aposta encontrada')
                return [];
            }
        }, function (error) {
            console.error(error);
            return [];
        });
}

module.exports = {
    getBetsOpens: getBetsOpens,
    getMatchDB: getMatchDB,
    getListBetsMatchFinish: getListBetsMatchFinish,
    getListMatches: getListMatches,
    update: update,
    store: store,
    getMatchesUpcomingOldersDB: getMatchesUpcomingOldersDB,
    isMatchExists: isMatchExists,
    formatObjMatch: formatObjMatch
}