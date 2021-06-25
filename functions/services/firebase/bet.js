
const admin = require('firebase-admin');
const moment = require('moment-timezone');
const { HLTV } = require('hltv');
const firebase_match = require('./match');
const firebase_user = require('./user');

module.exports.setBettingDataNotComputed = async () => {
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
				snap.forEach(bet => {
					let obj = bet.val();
					obj.key = bet.key;

					bets.push(obj);
				});

			} else {
				console.log('Sem apostas para computar');
			}

			return bets;
		});

	//pontos para atualizar no User

	let result = bets.reduce(function (obj, item) {
		obj[item.user_uid] = obj[item.user_uid] || [];

		obj[item.user_uid].push(item);

		return obj;
	}, {});

	Object.keys(result).forEach(key => {
		let points_result = 0;
	
		result[key].forEach( async (el, index) => {
	
			
			if (el.result == "win") {
				points_result += Number(el.reward_points);
			
			} else if (el.result == "lost") {
				points_result -= Number(el.risk_loss_points);
			}
			

			admin
				.database()
				.ref('bets/finish/' + el.key)
				.once('value')
				.then(snap => {
				
					snap.ref.update({ bet_computed: true });					
				});
								
		});
	
		admin
			.database()
			.ref('/users/' + key)
			.once('value').then(snapUser => {
				if (snapUser.exists()) {
					let new_points_monthly = 0;
					let new_points_yearly = 0;	

					if (points_result >= 0) {
						new_points_monthly = Number(snapUser.val().rank_points_monthly) + points_result;
						new_points_yearly = Number(snapUser.val().rank_points_yearly) + points_result;
					} 

					if (new_points_monthly < 0) {
						new_points_monthly = 0;
					}

					if (new_points_yearly < 0) {0
						new_points_yearly = 0;
					}

					try {
						createHistoryBets(result[key], snapUser.val());						
											
						snapUser.ref.update({ rank_points_monthly: new_points_monthly });
						snapUser.ref.update({ rank_points_yearly: new_points_yearly });
						
					} catch (error) {
						console.log(error)
					}
				}
			});
	});
}

const createHistoryBets = async (bets, user, ) => {
	let points_win = 0;
	let points_lost = 0;
	refund = false;

	let rank_points_monthly_current = Number(user.rank_points_monthly); 
	let rank_points_yearly_current = Number(user.rank_points_yearly);

	bets.forEach( async bet => {
		admin.database()
		.ref('/matches/finish/' + bet.match_id )
		.child('team1_name')          
		.once('value').then( snapTeam1_name => {
			if( snapTeam1_name.exists() ){
				let team1_name = snapTeam1_name.val();
				admin.database()
				.ref('/matches/finish/' + bet.match_id )
				.child('team2_name')          
				.once('value').then( snapTeam2_name => {
					
					if( snapTeam2_name.exists() ){
						let team2_name = snapTeam2_name.val();
						let new_points_monthly = 0;
						let new_points_yearly = 0;						

						if (bet.result == 'win') {
							points_win = bet.reward_points;
							
							new_points_monthly = Number(rank_points_monthly_current) + bet.reward_points;
							new_points_yearly = Number(rank_points_yearly_current) + bet.reward_points;					
						} else if (bet.result == 'lost') {
							points_lost = bet.risk_loss_points;
				
							new_points_monthly = Number(rank_points_monthly_current) - bet.risk_loss_points;
							new_points_yearly = Number(rank_points_yearly_current) - bet.risk_loss_points;
						}else if (bet.result == 'map not played') {
							refund = true;
						}
				
						var newRef = admin.database().ref('history_points_users/' + bet.user_uid).push();
				
						newRef.set({
								key_bet: bet.key,
								rank_points_monthly_previous: rank_points_monthly_current, //saldo anterior no momento que os pontos foram computados
								rank_points_monthly_updated: new_points_monthly, //saldo atualizado no momento que os pontos foram computados
								rank_points_yearly_previous: rank_points_yearly_current, //saldo anterior no momento que os pontos foram computados
								rank_points_yearly_updated: new_points_yearly, //saldo atualizado no momento que os pontos foram computados
								points_win: points_win, //pontos enviados ao usuário
								points_lost: points_lost, //pontos removidos do usuário
								status: bet.result,
								refund: refund,
								cost: bet.cost,
								bets_points_previous: Number(user.bet_points) - Number(bet.cost),
								team1_name: team1_name,
								team2_name: team2_name,
								match_id: bet.match_id,
								datetime_bet: bet.datetime,
								datetime: moment(new Date()).tz('America/Sao_Paulo').format('YYYY/MM/DD HH:mm'),
								description_bet: bet.type_bet_name,			
								user_bet_selected: bet.team_name
							})	
							
							rank_points_monthly_current = new_points_monthly;
							rank_points_yearly_current = new_points_yearly;
					}else{
						console.log('dont exists()');
					}				   
				});
			}else{
				console.log('dont exists()');
			}		
		});			
	});	
}


module.exports.validBet = async (key, bet, match_id, match_status) => {
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
			infoAdd: bet
		})
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

			if ((match.result.maps[type_bet.type].finish && match.result.maps[type_bet.type].winner)) {
				if (match.team1_id == match.result.maps[type_bet.type].winner.id || match.team2_id == match.result.maps[type_bet.type].winner.id) {
					console.log(`${bet.type_bet_name}: finaliza = ${match.result.maps[type_bet.type].finish}`);
					console.log(`${bet.type_bet_name}: possuí vencedor = ${match.result.maps[type_bet.type].winner.id}`);
					if (Number(match.result.maps[type_bet.type].winner.id && Number(bet.team_id))) {
						if (bet.match_id != match.match_id) {
							return
						}

						if (Number(match.result.maps[type_bet.type].winner.id) == Number(bet.team_id)) {
							result = "win";
						} else {
							result = "lost";
						}
					}
				}

			} else if ((match.status == "Match over" || match.status == 'Match postponed') && !match.result.maps[type_bet.type].winner) {
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

			} else if (isThereWinner && match.status == "Match over") {
				result = bet.team_id == match.result.winnerTeam.id ? 'win' : 'lost';
			}
		},
	}

	bet_result[type_bet._type]();

	if (result) {

		bet.result = result;

		update(key, bet, result, match);
	} else {
		console.log(`Não existe resultado ainda para aposta!`)
	}

}

const update = async (betKey, betObj, result, match = null) => {
	try {
		let notification = await getTextToNotification(result, betObj, match);

		admin.database().ref('/bets/finish/' + betKey).update(betObj).then(async snap => {
			//console.log( betObj, " aposta inserida nos finalizados");
			admin.database().ref('/bets/opens/' + betKey).remove().then(async snap => {
				//console.log( betObj, "Removido bet dos abertos" );
				firebase_user.setNotifications(betObj, result, betKey, notification.title, notification.message);
			}).catch(error => {
				console.log(error)
			});
		}).catch(error => {
			console.log(error)
		})

		let pathUserBetsFinishes = '/user-bets/' + betObj.user_uid + '/finish/' + betKey;
		let pathUserBetsOpens = '/user-bets/' + betObj.user_uid + '/opens/' + betKey;

		admin.database().ref(pathUserBetsFinishes).update(betObj).then(async snap => {
			//console.log('adicionado a aposta user-bets finalizados');
			admin.database().ref(pathUserBetsOpens).remove().then(async snap => {
				//console.log("Removido aposta user-bets opens");
			}).catch(error => {
				console.log(error)
				response = false;
			})
		}).catch(error => {
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
		win() {
			return `Parabéns, você apostou no(a) ${choice_team_name} e ganhou ${bet.reward_points} pontos! \n `;
		},
		lost() {
			return `Infelizmente, você apostou no(a) ${choice_team_name} e perdeu ${bet.risk_loss_points} pontos!`;
		},
		mapnotplayed() {
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