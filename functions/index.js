const functions = require('firebase-functions');
const admin = require('firebase-admin');
const api_hltv = require('./services/hltv');
const firebase_match = require('./services/firebase/match');
const firebase_bet = require('./services/firebase/bet');
const moment = require('moment-timezone');

const createMatchesRealTimeDatabase = async () => {
	//consulto partidas pelo package non-oficial da HLTV
	let result = true;
	let matches = await api_hltv.getMatchesHLTV();

	try {
		matches.forEach(async (matchHLTV, idx) => {
		
			if (matchHLTV.team1 && matchHLTV.team2) {
				
				console.log(`passei o id ${matchHLTV.id}`);
				await firebase_match.store(matchHLTV);
			}
		});
	} catch (error) {
		console.log(error);
		result = false;
	}

	await Promise.all(matches);

	return result;
};


const updateMatchesUpcoming = async () => {
	let response = true;
	let matchesUpcoming = await firebase_match.getListMatches('upcoming');	

	try {
	// 	//let lastDay = moment(new Date()).tz('America/Sao_Paulo').subtract(1, 'day').format('YYYY/MM/DD HH:mm');
		matchesUpcoming.forEach(async (item, idx) => {
			await firebase_match.update(item[0]);			
		});	
	} catch (error) {
		console.log(error);
		response = false;
	}

	await Promise.all(matchesUpcoming)
	
	return response;
};

const updateBetsMatchLive = async () => {
	let response = true;
	
	try {
		let getListMatchesLive = await firebase_match.getListMatches('live', 10);

		getListMatchesLive.forEach(  async function (item, idx) {
			
			let bets = await firebase_match.getBetsOpens(item[1].match_id);
			
			if (bets.length > 0) {
				console.log(`Encontrei ${bets.length} apostas `);
				console.log('Match: ' + item[1].match_id);

				bets.forEach(async bet => {
					await firebase_bet.validBet(bet[0], bet[1], bet[1].match_id, 'live');
				});				
			}
		});

		await Promise.all(getListMatchesLive);
		
	} catch (error) {
		console.log(error);
		response = false;
	}

	return response;
}

const updateBetsMatchFinish = async () => {
	let response = true;

	try {
		let bets = await firebase_match.getListBetsMatchFinish();
	
		if (bets.length > 0) {
			console.log(`Encontrei ${bets.length} apostas `);
			
			bets.forEach(async bet => {
				console.log('Match: ' + bet[1].match_id);
				await firebase_bet.validBet(bet[0], bet[1], bet[1].match_id, 'finish');
			});				
		}

		// getListBetsMatchFinish.forEach(bet => {
		// 	await admin.database().ref('/matches/finish/' + bet[1].match_id)
		// 		.once('value')
		// 		.then(async function (matchSnap) {
		// 			if (matchSnap.exists()) {

		// 			}
		// 		});
		// });

		await Promise.all(bets);				

	} catch (error) {
		console.log(error);
		response = false;
	}

	return response;
}

const getUsersDatabaseRealtime = async () => {
	return await admin.database().ref('/users/').once('value').then(async snapUsers => {
		return snapUsers;
	});
}

//atualiza partidas que estão live no banco de dados.
const updateMatchesLive = async () => {
	let response = true;
	let matchesLive = await firebase_match.getListMatches('live');	

	try {
	// 	//let lastDay = moment(new Date()).tz('America/Sao_Paulo').subtract(1, 'day').format('YYYY/MM/DD HH:mm');
		matchesLive.forEach(async (item, idx) => {
			await firebase_match.update(item[0], item[1].status);			
		});	
	} catch (error) {
		console.log(error);
		response = false;
	}

	await Promise.all(matchesLive)
};

exports.getMatchesDatabaseRealTime = functions.https.onRequest(async (req, res) => {
	
	let array_matches_today = [];
	let array_matches_tomorrow = [];
	let array_matches = [];
	let date = null;
	let matches_formatted = new Object();
	let tomorrow = moment().tz('America/Sao_Paulo').add(1, 'day').format('YYYY/MM/DD');
	let today = moment().tz('America/Sao_Paulo').format('YYYY/MM/DD');

	matches_promisse = admin.database().ref('/matches/upcoming')
		.orderByKey()
		.limitToFirst(15)
		.once('value')
		.then(snapshot => {
			let matchUpcoming = []

			if (snapshot.numChildren() > 0) {
				snapshot.forEach(function (matchSnapshot) {
					let isMatchUpcomingValid = false;
					let tierTeam1 = Object.hasOwnProperty.bind(matchSnapshot.val().team1 || {})('tier');
					let tierTeam2 = Object.hasOwnProperty.bind(matchSnapshot.val().team2 || {})('tier');

					if(  !matchSnapshot.val().live && ( tierTeam1 && tierTeam2) )
					{
						isMatchUpcomingValid = true
					}
				
					if ( isMatchUpcomingValid ) {
						matchUpcoming.push(matchSnapshot.val());
					}
				});
			}

			return matchUpcoming;
		});

	array_matches_live_promisse = admin.database().ref('/matches/live')
		.orderByKey()
		.limitToFirst(15)
		.once('value')
		.then(snapshot => {
			let matchLive = []

			if (snapshot.numChildren() > 0) {
				snapshot.forEach(function (matchSnapshot) {
					if (matchSnapshot.val().live) {
						
						let tierTeam1 = Object.hasOwnProperty.bind(matchSnapshot.val().team1 || {})('tier');
						let tierTeam2 = Object.hasOwnProperty.bind(matchSnapshot.val().team2 || {})('tier');

						if( tierTeam1 && tierTeam2 )
						{
							matchLive.push(matchSnapshot.val());
						}						
					}

				});
			}

			return matchLive;
		});

	let [matches,
		array_matches_live] = await Promise.all(
			[matches_promisse, array_matches_live_promisse]
		);

	matches.forEach(async (item) => {

		item.date ? date = item.date.substring(0, 10) : 'Live';

		switch (date) {
			case today:
				array_matches_today.push(item);
				break;
			case tomorrow:
				array_matches_tomorrow.push(item);
				break;
			case 'Live':

				break;
			default:
				array_matches.push(item);
				break;
		}

	});

	array_matches_today.sort((a, b) => {
		const now = moment().tz('America/Sao_Paulo');

		return moment(new Date(a.date)).tz('America/Sao_Paulo').diff(now) - moment(new Date(b.date)).tz('America/Sao_Paulo').diff(now);
	});

	array_matches.sort((a, b) => {
		const now = moment().tz('America/Sao_Paulo');

		return moment(new Date(a.date)).tz('America/Sao_Paulo').diff(now) - moment(new Date(b.date)).tz('America/Sao_Paulo').diff(now);
	});

	array_matches_tomorrow.sort((a, b) => {
		const now = moment().tz('America/Sao_Paulo');

		return moment(new Date(a.date)).tz('America/Sao_Paulo').diff(now) - moment(new Date(b.date)).tz('America/Sao_Paulo').diff(now);
	});

	// this gives an object with dates as keys
	const groups = array_matches.reduce((groups, match) => {
		const date = match.date.substring(0, 10);

		if (!groups[date]) {
			groups[date] = [];
		}

		let queryParams = false;

		if (req.query.name) {
			queryParams = (match.team1_name.toLowerCase().includes(req.query.name.toLowerCase())
				|| match.team2_name.toLowerCase().includes(req.query.name.toLowerCase()))
				|| match.event_name.toLowerCase().includes(req.query.name.toLowerCase())

			if (queryParams) {
				groups[date].push(match);
			}

		} else {
			groups[date].push(match);
		}

		return groups;
	}, {});

	// Edit: to add it in the array format instead

	const groupArrays = Object.keys(groups).map((date) => {
		return {
			title: date.substring(8, 10) + '/' + date.substring(5, 7) + '/' + date.substring(0, 4),
			data: groups[date]
		};
	});

	let arrayData = [];

	arrayData.push({
		title: 'Live', "data": array_matches_live.filter(
			item => {
				let queryParams = true;

				if (req.query.name) {
					queryParams = (item.team1_name.toLowerCase().includes(req.query.name.toLowerCase())
						|| item.team2_name.toLowerCase().includes(req.query.name.toLowerCase()))
						|| item.event_name.toLowerCase().includes(req.query.name.toLowerCase());
				}

				return queryParams;
			}
		)
	});

	arrayData.push({
		title: 'Ainda hoje', "data": array_matches_today.filter(
			item => {
				let queryParams = true;

				if (req.query.name) {
					queryParams = (item.team1_name.toLowerCase().includes(req.query.name.toLowerCase())
						|| item.team2_name.toLowerCase().includes(req.query.name.toLowerCase()))
						|| item.event_name.toLowerCase().includes(req.query.name.toLowerCase());
				}

				return queryParams;
			}
		)
	})

	arrayData.push({
		title: 'Amanhã', "data": array_matches_tomorrow.filter(
			item => {
				let queryParams = true;

				if (req.query.name) {
					queryParams = (item.team1_name.toLowerCase().includes(req.query.name.toLowerCase())
						|| item.team2_name.toLowerCase().includes(req.query.name.toLowerCase()))
						|| item.event_name.toLowerCase().includes(req.query.name.toLowerCase());
				}

				return queryParams;
			}
		)
	})

	groupArrays.forEach(element => {
		arrayData.push(element);
	})

	matches_formatted.data = arrayData;

	return res.status(200).send(matches_formatted.data);
});

exports.createMatchesSchedule = functions.pubsub.schedule('*/10 * * * *').onRun(async (context) => {
	await createMatchesRealTimeDatabase();

	console.log('This will be run every 8 minutes!');
	return null;
});

exports.updateMatchesUpcomingSchedule = functions.pubsub.schedule('*/7 * * * *').onRun(async (context) => {
	await updateMatchesUpcoming();

	console.log('updateMatchesUpcoming will be run every 10 minutes!');
	return null;
});

exports.updateMatchesLiveSchedule = functions.pubsub.schedule('*/4 * * * *').onRun(async (context) => {
	await updateMatchesLive();

	console.log('updateMatchesLive will be run every 3 minutes!');
	return null;
});
exports.updatePlayersTeamSchedule = functions.pubsub.schedule('*/5 * * * *').onRun(async (context) => {
	await getTeamsWithoutUpdatedPlayer();

	console.log('updateBetsMatchLive will be run every 3 minutes!');
	return null;
});

exports.updateBetsMatchLiveSchedule = functions.pubsub.schedule('*/6 * * * *').onRun(async (context) => {
	await updateBetsMatchLive();

	console.log('updateBetsMatchLive will be run every 3 minutes!');
	return null;
});

exports.updateBetsMatchFinishSchedule = functions.pubsub.schedule('*/6 * * * *').onRun(async (context) => {
	await updateBetsMatchFinish();

	console.log('updateBetsMatchLive will be run every 3 minutes!');
	return null;
});

exports.updateRankingMonthly = functions.pubsub.schedule('*/10 * * * *').onRun(async (context) => {
	let users_ref = await getUsersDatabaseRealtime();
	let objsUser = Object.entries(users_ref.val());

	// sorting the mapped array containing the reduced values
	let sort = objsUser.sort(function (a, b) {
		let result = b[1].rank_points_monthly - a[1].rank_points_monthly;
		return result;
	});

	let mapped = sort.map(function (item, index) {
		item[1].rank_monthly = index + 1;

		return item
	});

	mapped.forEach((item, index) => {
		admin.database().ref('/users/' + item[0]).update(item[1]);

	});

	return null;
});

exports.onUserCreate = functions.https.onRequest(async (req, res) => { return 'teste' });

exports.updateRankingYearly = functions.pubsub.schedule('*/8 * * * *').onRun(async (context) => {
	let users_ref = await getUsersDatabaseRealtime();
	let objsUser = Object.entries(users_ref.val());

	// sorting the mapped array containing the reduced values
	let sort = objsUser.sort(function (a, b) {
		let result = b[1].rank_points_yearly - a[1].rank_points_yearly;

		// if ( result  === 0 ){
		// 	result = b.win - a.win;
		// }

		return result;
	});

	let mapped = sort.map(function (item, index) {
		item[1].rank_yearly = index + 1;

		return item
	});

	mapped.forEach((item, index) => {
		admin.database().ref('/users/' + item[0]).update(item[1]);

	});

	return null;
})




exports.getRankTeam = functions.https.onRequest(async (req, res) => {
	let team = {};

	if (req.query.teamid) {
		await admin.database()
			.ref('/teams/' + req.query.teamid)
			.once('value').then(async (snapTeam) => {
				if (snapTeam.exists()) {
					team = snapTeam.val();

					let diff = moment(moment().tz('America/Sao_Paulo')).diff(moment(team.updated_at), "days");

					if (diff >= 7) {
						team = await getTeamHTLV(req.query.teamid);
						team.updated_at = team.updated_at = moment().tz('America/Sao_Paulo').format();;
						await admin.database().ref('/teams/' + team.id).update(JSON.parse(JSON.stringify(team)));
					}
				} else {
					team = await getTeamHTLV(req.query.teamid);
					team.updated_at = team.updated_at = moment().tz('America/Sao_Paulo').format();;
					await admin.database().ref('/teams/' + team.id).update(JSON.parse(JSON.stringify(team)));
				}
			});
	} else {
		return res.json({ error: 'teamid is required' });
	}

	let tier = await admin.database().ref('/tier-by-rank/' + team.rank).once('value').then(function (snapTier) {
		if (snapTier.exists()) {
			return snapTier.val();
		} else {
			return { tier: 7 }
		}
	});

	team.tier = tier.tier;

	if (req.query.tier) {
		return res.status(200).send(team.tier);
	}

	return res.status(200).send(team);
});

exports.teste1 = functions.https.onRequest(async (req, res) => {
	await createMatchesRealTimeDatabase(); 
	//await updateMatchesLive();    
});

exports.teste2 = functions.https.onRequest(async (req, res) => {
	const bet = {
		cost:
			10,
		date_match:
			"2021/02/16 06:00",
		datetime:
			"2021/02/15 16:34",
		match_id:
			2346596,
		result:
			"",
		reward_points:
			"25",
		risk_loss_points:
			"13",
		team1_percentual_rank:
			50,
		team2_percentual_rank:
			50,
		team_id:
			10998,
		team_name:
			"Ninja",
		type_bet_id:
			3,
		type_bet_name:
			"Vencedor - Map 2",
		user_uid:
			"sV4LxdQYtNYl8mGStTXhdrWSLM52"
	}

	var newBetKey = admin.database().ref().child('bets').push().key;
	var updates = {};

	updates['/bets/opens/' + newBetKey] = bet;
	updates['/user-bets/v5ZakbLgrBeJs3nDIyouJViSUcG2/opens/' + newBetKey] = bet;

	admin.database().ref().update(updates, function (error) {
		if (error) {
			// The write failed...
			console.log(error);
			console.log("error in insert bet, | File: Bet.js | Function: recordBet() |");

			return false;
		} else {
			//Data saved successfully!


		}
	});

	return res.json('match1');
});

exports.basicTest = function () {
	const a = 1;
	const b = 5;
	return a + b;
}

exports.update_points = functions.database.ref('/bets/opens/{key}').onCreate(event => {
	if (event.exists()) {
		return admin.database()
			.ref('/users')
			.child(event.val().user_uid)
			.child('bet_points')
			.set(admin.database.ServerValue.increment(-Math.abs(Number(event.val().cost)))).then(() => {
				console.log('User: ', event.val().user_uid, ' efetuou uma aposta!',
					'Custo: ', -Math.abs(Number(event.val().cost)),
					'Aposta Key: ', event.key)
			}).catch(error => { console.log(error) });
	} else {
		return Promise.reject('Unknown error');
	}
});

// exports.update_points = functions.database.ref('/bets/finish/{key}').onCreate(event => {        
// 	if ( event.exists()  ){
// 		return admin.database()
// 		.ref('/users')
// 		.child(event.val().user_uid)
// 		.child('bet_points')
// 		.set(admin.database.ServerValue.increment(-Math.abs(Number(event.val().cost)))).then( () => {
// 			console.log('User: ', event.val().user_uid, ' efetuou uma aposta!', 
// 			'Custo: ', -Math.abs(Number(event.val().cost)),
// 			'Aposta Key: ', event.key)
// 		}).catch( error => { console.log(error) });
// 	} else { 
// 		return Promise.reject('Unknown error');
// 	}		
// });

exports.getMatchHTLV = functions.https.onRequest(async (req, res) => {
	let match = {};

	if (req.query.id) {
		await HLTV.getMatch({ id: req.query.id }).then((res) => {
			//console.log(res);
			match = res;
			return res;

		});

		return res.json(match);
	}
	else {
		return res.json({ error: 'id field is required' });
	}
});

const updateLocationPlayer = async (player_id, team_id, index) => {

	let player = await HLTV.getPlayer({ id: player_id }).then((res) => {
		return res;
	});

	admin.database().ref('/teams/' + team_id + '/players/' + index).update({ country: player.country.name });
}

const getTeamsWithoutUpdatedPlayer = () => {
	let result = true;

	try {
		admin.database().ref('/teams')
			.orderByChild('players_countrys_updated')
			.equalTo(false).limitToFirst(3)
			.once('value').then(snap => {

				if (snap.exists()) {
					snap.forEach(team => {
						let playersWithoutCountry = Object.entries(team.child('players').val()).filter(e => {
							return e[1].country == undefined;
						});

						if (playersWithoutCountry.length > 0) {
							playersWithoutCountry.forEach(player => {
								console.log('atualizando o time ', team.val().id)
								updateLocationPlayer(player[1].id, team.val().id, player[0]);

							});
						} else {

							let brazilianPlayers = Object.entries(team.child('players').val()).fil2ter(e => {

								return e[1].country == 'Brazil';
							});

							if (brazilianPlayers.length > 0) {
								team.ref.update({ player_br: true })
							} else {
								team.ref.update({ player_br: false })
							}

							team.ref.update({ players_countrys_updated: true, updated_at: moment().tz('America/Sao_Paulo').format() });
						}

					})
				}
			});
	} catch (error) {
		console.log(error);
		result = false;
	}

	return result;
}
