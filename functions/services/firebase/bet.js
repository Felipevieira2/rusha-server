
const admin = require('firebase-admin');
const moment = require('moment-timezone');
const { HLTV } = require('hltv');
const firebase_match = require('./match');
const firebase_user = require('./user');

module.exports.validBet = async (key, bet, match_id, match_status) =>  { 

    let match = await firebase_match.getMatchDB(match_id, match_status);
    let result = await check_bets(bet, match);
    if ( result != '' ) {
        bet.result = result;
	
        update(key, bet, result, match);
    }else {
        console.log(`Não existe resultado ainda para aposta!`)
    }
}

const check_bets = async (bet, match) => {    
	let type_bet = await getTypeBet(bet.type_bet_id);  
	let result = '';
	let bet_result = {
		map() {
			let mapPlayed = Object.hasOwnProperty.bind(match.result.maps[type_bet.type] || {})('winner');
            
			if (mapPlayed) {
				result = bet.team_id == match.result.maps[type_bet.type].winner.id ? 'win' : 'lost';
			} else if (match.status == 'Match over' && mapPlayed == false) {
				result = 'map not played';
			}
		},		
		game() {
			let isThereWinner = Object.hasOwnProperty.bind(match.result || {})('winnerTeam');

			if (isThereWinner) {
				result = bet.team_id == match.result.maps[type_bet.type].winner.id ? 'win' : 'lost';
			}
		},
	}

	bet_result[type_bet.type_bet]();

	return result;
}

const update = async (betKey, betObj, result, match = null) => {
	let notification = await getTextToNotification(result, betObj, match);

    admin.database().ref('/bets/finish/' + betKey).update(betObj).then ( async snap => {
        console.log( betObj, " aposta inserida nos finalizados");
        admin.database().ref('/bets/opens/' +  betKey).remove().then( async snap => {
            console.log( betObj, "Removido bet dos abertos" );
            firebase_user.updateScoreUsers(betObj, result, betKey, notification.title, notification.message);
        }).catch( error => {
            console.log(error)
        });			
    }).catch( error => {
        console.log(error)
    })	

	let pathUserBetsFinishes = '/user-bets/' + betObj.user_uid + '/finish/' + betKey;
	let pathUserBetsOpens = '/user-bets/' + betObj.user_uid + '/opens/' + betKey;

	admin.database().ref(pathUserBetsFinishes).update(betObj).then ( async snap => {
		console.log('adicionado a aposta user-bets finalizados');
		admin.database().ref(pathUserBetsOpens).remove().then( async snap => {
			console.log("Removido aposta user-bets opens");
		} ).catch( error => {
			console.log(error)
			response = false;
		})				
		}).catch( error => {
			console.log(error)
			response = false; 
		})
}
const getTextToNotification = async (result, bet, match) => {
	let bet_description = bet.type_bet_name; 
	let team1_name = match.team1_name;
	let team2_name = match.team2_name;
	let choice_team_name = bet.team_name;

	let getMessage = {
		win(){
			return `Parabéns, você apostou na vitória do time: ${choice_team_name} e ganhou 30 pontos.`;
		},
		lost(){
			return `Infelizmente, você apostou na vitória do time: ${choice_team_name} e perdeu 15 pontos`;
		},
		mapnotplayed(){
			return `Aposta estornada, você apostou na vitória do time: ${choice_team_name} porém, os dois times não jogaram o mapa`;
		}		
	}

	let notifications = { 
		title: `Aposta: ${bet_description} - ${team1_name} ${team2_name}`,
		message: getMessage[result.split(' ').join('')]()
	}

	return notifications;
}

const getTypeBet = async (type_bet_id) => {
	return await admin.database().ref('/bet-types')
		.orderByChild('id')
		.equalTo(Number(type_bet_id))
		.limitToFirst(1)
		.once('value')
		.then(snap => {

			let betType = null;

			if (snap.exists()) {
				snap.forEach(item => { betType = item.val(); });
			} else {
				console.log('não encontrado tipo de aposta, função: getTypeBet');
			}

			return betType;
		});
}