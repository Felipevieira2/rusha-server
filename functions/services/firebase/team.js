const admin = require('firebase-admin');
const moment = require('moment-timezone');
const { HLTV } = require('hltv');

const getRankTeamMatch = async (team_id) => { 	
	let team = {};

	if ( Number(team_id) > 0 ) {
		await admin.database()
			.ref('/teams/' + team_id)
			.once('value').then( async (snapTeam) => {
				if ( snapTeam.exists() ) 
				{
					team = snapTeam.val();
					
					let diff = moment(moment().tz('America/Sao_Paulo')).diff(moment(team.updated_at) , "days");

					if ( diff >= 14 )
					{
						teamHLTV = await getTeamHTLV(team_id);

						team.id  = teamHLTV.id;
						team.location = teamHLTV.location;
						team.name = teamHLTV.name;
						team.players = teamHLTV.players;
						team.rank = teamHLTV.rank;
						team.updated_at =  moment().tz('America/Sao_Paulo').format();

						await admin.database().ref('/teams/' + team.id).update(JSON.parse(JSON.stringify(team)));
					}
				}else {
					teamHLTV = await getTeamHTLV(team_id);

					team.id  = teamHLTV.id;
					team.location = teamHLTV.location;
					team.name = teamHLTV.name;
					team.players = teamHLTV.players;
					team.rank = teamHLTV.rank;
					team.updated_at = teamHLTV.updated_at =  moment().tz('America/Sao_Paulo').format();					

					await admin.database().ref('/teams/' + team.id).update(JSON.parse(JSON.stringify(team)));
				}
			});		

		let tier = await admin.database().ref('/tier-by-rank/' + team.rank).once('value').then( function (snapTier) { 
			if ( snapTier.exists() )
			{
				return snapTier.val();
			}else {
				return { tier: 7 }
			}		
		});

		team.tier = tier.tier;		
	}

	return team;
}


const getTeamHTLV = async (team_id) => {
	let team = {};

	try {
		await HLTV.getTeam({ id: team_id }).then(res => {
			team = res
		})
	} catch (error) {
		console.log(error);
	}

	return team;
}


const getTeamsNeedUpdate = async () => {
	let teams = await admin.database()
		.ref('/teams_need_insert')
		.orderByChild('status')
		.equalTo(false)
		.limitToFirst(3)
		.once('value').then(  (snapTeam) => {			
			if ( snapTeam.exists() ) 
			{		
				let teamsFirebase = [];

				snapTeam.forEach(  el => {
					
					teamsFirebase.push(el.val());

				})
				return teamsFirebase;	
			}else {
				return [];
			}
		})

	teams.forEach( async el => {
		teamHLTV = await getTeamHTLV(el.team_id);
	
		if ( teamHLTV ) {
			let team = {};
			team.id  = teamHLTV.id;
			team.location = teamHLTV.location;
			team.name = teamHLTV.name;
			team.players = teamHLTV.players;
			team.rank = teamHLTV.rank;
			team.updated_at = teamHLTV.updated_at = moment().tz('America/Sao_Paulo').format();					
			console.log(team.id)

			admin.database()
				.ref('/teams/' + team.id)
				.update(JSON.parse(JSON.stringify(team)))
				.then(() => {
					admin.database()
						.ref('/teams_need_insert/' + team.id)
						.update({
							status: true, updated_at: moment().tz('America/Sao_Paulo').format()
						});
				});
		}
	});
	
}

module.exports = {
    getRankTeamMatch,
	getTeamsNeedUpdate
}