
const admin = require('firebase-admin');
const moment = require('moment-timezone');
const { HLTV } = require('hltv');
const { user } = require('firebase-functions/lib/providers/auth');

module.exports.updateScoreUsers = async (bet, result, betKey, titleNotification, msgNotification) => {
	const reward_points = parseInt(bet.reward_points);
	const risk_points = parseInt(bet.risk_loss_points);

	await getUserSnapUser(bet.user_uid).then(async userSnapUser => {		
		let points_monthly = userSnapUser.val().rank_points_monthly;
		let points_yearly = userSnapUser.val().rank_points_yearly;
		let now = moment().tz('America/Sao_Paulo').format('YYYY/MM/DD HH:mm');

		if (result == 'map not played') {
			userSnapUser.ref.update({
				bet_points: userSnapUser.val().bet_points + bet.cost
			}).catch(error => {
				console.log(error);
			});

			let newNotification = {
				type: 'refund',
				title: titleNotification,
				msg: msgNotification,
				date: now,
				status: 'notSent',
				was_read: false,
				first_notification: false,
				push_notification: false,
			};

			admin.database().ref('/users/' + bet.user_uid + '/notifications/' + betKey).set(newNotification).then(snapUser => { });
			
            } else {
                let new_points_monthly = result == 'win' ? Number(points_monthly) + Number(reward_points) : Number(points_monthly) - Number(risk_points);
                let new_points_yearly = result == 'win' ? Number(points_yearly) + Number(reward_points) : Number(points_yearly) - Number(risk_points);
                let type = result == 'win' ? 'win' : 'lost';

                if (new_points_monthly < 0) {
                    new_points_monthly = 0;
                }

                if (new_points_yearly < 0) {
                    new_points_yearly = 0;
                }

                userSnapUser.ref.update({
                    rank_points_monthly: new_points_monthly.toFixed(0),
                    rank_points_yearly: new_points_yearly.toFixed(0),
                });

                let newNotification = {
                    type: type,
                    msg: msgNotification,
                    title: titleNotification,
                    date: now,
                    status: 'notSent',
                    was_read: false,
                    first_notification: false,
                    push_notification: false,
                };

                admin.database().ref('/users/' + bet.user_uid + '/notifications/' + betKey).set(newNotification).then(snapUser => { });
            }

        })
}

const getUserSnapUser = async (user_uid) => {
	return await admin.database().ref('/users/' + user_uid).once('value').then(async snapUser => {
		return snapUser;
	});
}

const getWinnersMounth = async (limitRange = 10) => {
	return await admin
    .database()
    .ref('/users/')
    .limitToFirst(limitRange)
    .once('value').then( snapUser => {
        let users = [];

        if ( snapUser.exists() ){
            console.log(snapUser.numChildren());
            snapUser.forEach( function(el){
                users.push({
                    name: el.val().name,
                    rank_monthly: el.val().rank_monthly,
                    rank_points_monthly: el.val().rank_points_monthly,
                    uid: el.val().uid || '',
                })
            });
    
           users.sort((a, b) => a.rank_monthly - b.rank_monthly);
        }

        return users;        
	});
}

const getWinnersYear = async (limitRange = 10) => {
	return await admin
    .database()
    .ref('/users/')
    .limitToFirst(limitRange)
    .once('value').then( snapUser => {
        let users = []; 

        if ( snapUser.exists() ){
            console.log(snapUser.numChildren());
            snapUser.forEach( function(el){
                users.push({
                    name: el.val().name,
                    rank_yearly: el.val().rank_yearly,
                    rank_points_yearly: el.val().rank_points_yearly,
                    uid: el.val().uid || '',
                });
            });
    
            users.sort((a, b) => a.rank_yearly - b.rank_yearly);
        }

        return users;        
	});
}

const storeWinnersMounth = async (arr) => {
    let mounthCurrent = moment().tz('America/Sao_Paulo').subtract(1, 'day').format('MM');
    let yearCurrent = moment().tz('America/Sao_Paulo').subtract(1, 'day').format('YYYY');

    admin
    .database()
    .ref(`/awards/${yearCurrent}/${mounthCurrent}/winnersMonth/`)
    .set(arr);    
}

const storeWinnersYear = async (arr) => {    
    let yearCurrent = moment().tz('America/Sao_Paulo').subtract(1, 'day').format('YYYY');

    admin.database()
    .ref(`/awards/${yearCurrent}/winnersYear/`)
    .set(arr);    
}


const resetAllRankPointsUsersMonth = async () => {    
    let users = await getsKeysUsers();
    
    users.forEach( function(el){
        recordHistoryRank(el).then( () => {
            resetUserPoints(el.user_uid, 'rank_points_monthly', 'rank_monthly');   
        })     
    });     

    await Promise.all(users); 
}

const resetAllRankPointsUsersYear = async () => {
    let users = await getsKeysUsers();
    
    users.forEach( function(el){
        resetUserPoints(el.user_uid, 'rank_points_yearly', 'rank_yearly');     
    });     

    await Promise.all(users); 
} 

const getsKeysUsers = async () => {  
    return await admin 
    .database()
    .ref('/users/')   
    .once('value').then( snapUser => {
        let users = []; 

        if ( snapUser.exists() ){
            snapUser.forEach( function(el){
                users.push({
                    user_uid: el.key,
                    name: el.val().name,
                    rank_monthly: el.val().rank_monthly,
                    rank_points_monthly: el.val().rank_points_monthly,    
                    rank_yearly: el.val().rank_yearly,
                    rank_points_yearly: el.val().rank_points_yearly          
                });
            });                      
        }

        return users;        
	});
}

const resetUserPoints = async (user_uid, fieldName1, fieldName2) => {      
    return await admin
    .database()
    .ref('/users/' + user_uid)
    .update({ [fieldName1] : 0,  [fieldName2] : 0,})
}

const recordHistoryRank = async (user) => {  

    let mounthCurrent = moment().tz('America/Sao_Paulo').subtract(1, 'day').format('MM');
    let yearCurrent = moment().tz('America/Sao_Paulo').subtract(1, 'day').format('YYYY');

    admin
    .database()
    .ref(`/users-rank-history/${yearCurrent}/${mounthCurrent}/${user.user_uid}`)
    .set(user);        
}

module.exports = {
    getWinnersMounth,  
    storeWinnersMounth,
    storeWinnersYear,
    getWinnersYear,
    resetAllRankPointsUsersMonth,
    resetAllRankPointsUsersYear
}