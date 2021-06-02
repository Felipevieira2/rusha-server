
const admin = require('firebase-admin');
const moment = require('moment-timezone');
const { HLTV } = require('hltv');
const firebase_match = require('./match');
const firebase_user = require('./user');

module.exports.setBettingDataNotComputed = async () =>  { 
	//var newHistotyRef = admin.database().ref('/history_bets/').push();
	let bets = await admin
		.database()
		.ref('bets/finish')
		.orderByChild('bet_computed')
		.equalTo(false)
		.limitToFirst(10)
		.once('value')
		.then(snap => {
			let bets = [];

			if (snap.exists()) {
				snap.forEach( bet => {
					let obj = bet.val();
					obj.key = bet.key;

					bets.push(obj);
				})
			
			}else {
				console.log('Sem apostas para computar');								
			}
			
			return bets;
		})	

	//pontos para atualizar no User


	let result =  bets.reduce(function (obj, item) {
		obj[item.user_uid] = obj[item.user_uid] || [];
	
		obj[item.user_uid].push(item);

		return obj;
	}, {});

	Object.keys(result).forEach ( key => { 
		
		let points_result = 0;

		result[key].forEach( el => { 
			el.result == "win"  ? points_result += Number(el.reward_points) : points_result -= Number(el.risk_loss_points);			
			admin
			.database()
			.ref('bets/finish/' + el.key)			
			.once('value')
			.then(snap => {
				snap.ref.update({bet_computed: true});
			})
		});

		admin
		.database()
		.ref('/users/'+ key)
		.once('value').then(  snapUser => {
			if( snapUser.exists() ) {
				let new_points_monthly = 0;
				let new_points_yearly = 0;
				
				if( points_result >= 0 ) {
					new_points_monthly = Number(snapUser.val().rank_points_yearly) + points_result;
					new_points_yearly  = Number(snapUser.val().rank_points_yearly) + points_result;
				}else {
					new_points_monthly = Number(snapUser.val().rank_points_yearly) + points_result;
					new_points_yearly  = Number(snapUser.val().rank_points_yearly) + points_result;
				}
			
	
				if( new_points_monthly < 0) { 
					new_points_monthly = 0;
				}
	
				if( new_points_yearly < 0) { 
					new_points_yearly = 0;
				}
	
				try {
					snapUser.ref.update({rank_points_monthly: new_points_monthly});
					snapUser.ref.update({rank_points_yearly: new_points_yearly});
				} catch (error) {
					console.log(error)
				}			
			}
		});		
	})


	
}


module.exports.validBet = async (key, bet, match_id, match_status) =>  { 
	try {
		let match = await firebase_match.getMatchDB(match_id, match_status);
		
		if (match.result) {
			check_bets(bet, match, key);	
			
			return 
		}		

		if (match) { 			
			matchHLTV = await HLTV.getMatch({ id: match_id }).then((res) => {
			
				
				return res;
	
			});

			let matchFormatada = await firebase_match.formatObjMatch(matchHLTV, true);

			if (matchFormatada.result) {
				check_bets(bet, matchFormatada, key);	
				
				return 
			}	
		}
		
	} catch (error) {
		let date = moment().tz('America/Sao_Paulo').format('DD/MM/YYYY hh:mm:ss');

		var newPostRef = admin.database().ref('/errors/').push();

		newPostRef.set({ 
			datetime: date, 
			msg: error.message, 
			function: 'validBet',
			infoAdd: bet})
	}    
}

const check_bets = async (bet, match, key) => {   	
	let type_bet = await getTypeBet(bet.type_bet_id);  	
	let result = '';

	let bet_result = {
		map() {	
			console.log(`///////// INICIO DE VALIDAÇÃO DE APOSTA //////////`);
			console.log(`Checando aposta name: ${bet.type_bet_name} sua escolha id: ${bet.team_id}`);
			console.log(`Jogo: ${bet.match_id}`);			

			if ( match.result.maps[type_bet.type].finish && match.result.maps[type_bet.type].winner ) {
				console.log(`${ bet.type_bet_name }: finaliza = ${match.result.maps[type_bet.type].finish}`);
				console.log(`${ bet.type_bet_name }: possuí vencedor = ${match.result.maps[type_bet.type].winner.id}`);	
				if ( Number(match.result.maps[type_bet.type].winner.id && Number(bet.team_id) ) ){
					if( bet.match_id != match.match_id ){
						return 
					}

					if (Number(match.result.maps[type_bet.type].winner.id) == Number(bet.team_id) ) { 					
						result = "win";
					}else {
						result = "lost";
					}	
				}																			
			}else if (match.status == "Match over" || match.status == 'Match postponed'  ) {
				result = 'map not played';
			}
			
			console.log(`resultado = ${result}`);

			console.log(`///////// FIM DE VALIDAÇÃO DE APOSTA //////////`);
		},		
		game() {		
			let isThereWinner = match.result.winnerTeam != undefined;
			let isPostponed = match.status == "Match postponed";

			if (isPostponed) {
				result = 'map not played';
			
			}else if (isThereWinner) {
				result = bet.team_id == match.result.winnerTeam.id ? 'win' : 'lost';
			}					
		},
	}
	
	bet_result[type_bet._type]();

	if ( result ) {
		
		bet.result = result;
		
		update(key, bet, result, match);
	}else {
		console.log(`Não existe resultado ainda para aposta!`)
	}

}

const update = async (betKey, betObj, result, match = null) => {
	try {
		let notification = await getTextToNotification(result, betObj, match);

		admin.database().ref('/bets/finish/' + betKey).update(betObj).then ( async snap => {
			//console.log( betObj, " aposta inserida nos finalizados");
			admin.database().ref('/bets/opens/' +  betKey).remove().then( async snap => {
				//console.log( betObj, "Removido bet dos abertos" );
				firebase_user.setNotifications(betObj, result, betKey, notification.title, notification.message);
			}).catch( error => {
				console.log(error)
			});			
		}).catch( error => {
			console.log(error)
		})	
	
		let pathUserBetsFinishes = '/user-bets/' + betObj.user_uid + '/finish/' + betKey;
		let pathUserBetsOpens = '/user-bets/' + betObj.user_uid + '/opens/' + betKey;
	
		admin.database().ref(pathUserBetsFinishes).update(betObj).then ( async snap => {
			//console.log('adicionado a aposta user-bets finalizados');
			admin.database().ref(pathUserBetsOpens).remove().then( async snap => {
				//console.log("Removido aposta user-bets opens");
			} ).catch( error => {
				console.log(error)
				response = false;
			})				
			}).catch( error => {
				console.log(error)
				response = false; 
			})
	} catch (error) {
		console.log(error);
	}
}

const getTextToNotification = async (result, bet, match) => {
	let bet_description = bet.type_bet_name; 
	let team1_name = match.team1_name;
	let team2_name = match.team2_name;
	let choice_team_name = bet.team_name;

	let getMessage = {
		win(){
			return `Parabéns, você apostou no(a) ${choice_team_name} e ganhou ${bet.reward_points} pontos! \n `;
		},
		lost(){
			return `Infelizmente, você apostou no(a) ${choice_team_name} e perdeu 15 pontos`;
		},
		mapnotplayed(){
			return `Sua aposta no(a) ${choice_team_name} foi estornada, pois o mapa ou evento não foi disputado!`;
		}		
	}

	let notifications = { 
		title: `${team1_name} x ${team2_name} | ${bet.type_bet_name}`,
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