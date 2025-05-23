//Login user
async function login(event) {
    event.preventDefault();
    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;
    const keepLoggedIn = document.getElementById('keepLogin').checked;
    if (keepLoggedIn === true)
        localStorage.setItem('keepLoggedIn', true);
    else if (keepLoggedIn === false && localStorage.getItem('keepLoggedIn') !== null)
        localStorage.removeItem('keepLoggedIn');
    const url = '/api/auth/login/';
    document.getElementById('loginLoading').classList.toggle('d-none');
    await fetch(url, {
        method: 'POST',
        body: JSON.stringify({
            username: username,
            password: password
        }),
        headers: {
            'Content-Type': 'application/json; charset=utf-8'
        }
    }).then(async response => {
        let data = await response.json();
        if (response.status === 200) {
            document.getElementById('loginUsername').classList.remove('is-invalid');
            document.getElementById('loginPassword').classList.remove('is-invalid');
            return data;
        }
        else if (response.status === 502) {
            throw new Error('Server error');
        }
        else if (data?.error === 'User already logged in.') {
            alert(i18next.t('login.alreadyLoggedIn'));
            return null;
        }
        else if (data?.error === 'User is deactivated.') {
            alert(i18next.t('login.deactivated'));
            return null;
        }
        else {
            document.getElementById('loginUsername').classList.add('is-invalid');
            document.getElementById('loginPassword').classList.add('is-invalid');
            return null;
        }
    }).then(data => {
        if (data == null){
            document.getElementById('loginLoading').classList.toggle('d-none');
            return;
        }
        if (data.detail === 'Email sent.')
        {
            let modal = new bootstrap.Modal(document.getElementById('f2aModal'));
            modal.show();
            return;
        }
        if (data !== null) {
            sessionStorage.setItem('jwt', data.access);
            sessionStorage.setItem('refresh', data.refresh);
            if (keepLoggedIn)
                localStorage.setItem('refresh', data.refresh);
            loggedIn = true;
            window.localStorage.setItem('loggedIn', loggedIn);
            document.getElementById('loginLoading').classList.toggle('d-none');
        }
    }).catch(error => {
        let modal = new bootstrap.Modal(document.getElementById('loginFailModal'));
        modal.show();
        document.getElementById('loginLoading').classList.toggle('d-none');
        translateAll();
    });

    postLogin();
}

//Handle the OAuth return
async function handleOAuthReturn() {
    const urlParams = new URLSearchParams(window.location.search);
    const access = urlParams.get('access');
    const refresh = urlParams.get('refresh');
    
    if (access && refresh && access.length > 20 && refresh.length > 20) {
        sessionStorage.setItem('jwt', access);
        sessionStorage.setItem('refresh', refresh);
        
        if (localStorage.getItem('keepLoggedIn') === 'true') {
            localStorage.setItem('refresh', refresh);
        }
        loggedIn = true;
        window.localStorage.setItem('loggedIn', loggedIn);
        
        history.replaceState({}, document.title, window.location.pathname);
        
        postLogin();
        return true;
    }
    else{
        const error = urlParams.get('error');
        await i18next.loadNamespaces('translation');
        await i18next.changeLanguage(_lang);
        if (error) {
            window.location.href = '/';
            window.localStorage.setItem('loggedIn', false);
            window.localStorage.removeItem('jwt');
            window.localStorage.removeItem('refresh');
            window.sessionStorage.setItem('42error', error);
        }
        return false;
    }
}

async function loginWith42(){
    window.location.href = '/api/oauth/login';
}

// On page load
document.addEventListener('DOMContentLoaded', async function() {
    
    loggedIn = window.localStorage.getItem('loggedIn') === 'true';
    
    if (loggedIn && sessionStorage.getItem('jwt')) {
        startSessionCheck();
    }
    
    if (!loggedIn)
        await handleOAuthReturn();
    else
        return;

    // Check for a stored refresh token (previous login)
    if (!loggedIn && (localStorage.getItem('refresh') || sessionStorage.getItem('refresh'))) {
        const storedRefresh = localStorage.getItem('refresh') || sessionStorage.getItem('refresh');
        sessionStorage.setItem('refresh', storedRefresh);
        
        // Attempt to renew the token using the refresh token
        refreshLogin().then(() => {
            if (sessionStorage.getItem('jwt')) {
                loggedIn = true;
                window.localStorage.setItem('loggedIn', loggedIn);
                postLogin();
            }
        });
    }
});

//Initialize main page after login
async function postLogin(){
    if (loggedIn) {
        document.getElementById('header').style.display = 'block';
        _user = await getUserData();
        if (_user !== null)
        {
            _lang = _user.idiom;
            localStorage.setItem('lang', _lang);
            await i18next.changeLanguage(_lang);
        }
        await getNotifications();
        await getUserAvatar(_user.id).then(avatar => { _avatar = avatar; });
        document.getElementById('header-avatar').src = _avatar;
        changeContent('overview', true);
        history.replaceState(pageState, null, "");

        startSessionCheck();
    }
}

// Periodic session verification
let sessionCheckInterval;

function checkSessionValidity() {
    const token = sessionStorage.getItem('jwt');
    if (!token) return;
    
    fetch('/api/auth/check_session/', {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    })
    .then(async response => {
        if (response.status == 401) {
            const data = await response.json().catch(() => ({}));
            
            if (data.code === 'token_not_valid' && 
                data.detail === 'Given token not valid for any token type') {
                    return;
            }
            else {
                alert(data.detail || i18next.t('login.sessionExpired', 'Your session has expired because you are logged in elsewhere'));
                clearSession();
                window.location.href = '/?error=session_expired';
            }
        }
        else if (response.status == 200) {
            return;
        }
    })
    .catch();
}


function startSessionCheck() {
    if (sessionCheckInterval) 
        clearInterval(sessionCheckInterval);
    // Set recheck every 15 seconds
    sessionCheckInterval = setInterval(checkSessionValidity, 15000);
    checkSessionValidity();
}

function stopSessionCheck() {
    if (sessionCheckInterval) {
        clearInterval(sessionCheckInterval);
        sessionCheckInterval = null;
    }
}


//Confirm the 2FA code
async function confirmF2A() {
    const keepLoggedIn = document.getElementById('keepLogin').checked;
    if (keepLoggedIn)
        localStorage.setItem('keepLoggedIn', true);
    else
        localStorage.removeItem('keepLoggedIn');
    let input = document.getElementById('login2FA');
    let f2a = input?.value;
    if (f2a === '' || f2a == undefined) {
        input.classList.add('is-invalid');
        return;
    }
    input.classList.remove('is-invalid');
    const url = '/api/auth/check_otp/';
    await fetch(url, {
        method: 'POST',
        body: JSON.stringify({
            otp: f2a,
            purpose: 'tfa'
        }),
        headers: {
            'Content-Type': 'application/json; charset=utf-8'
        }
    }).then(response => {
        if (response.status === 200) {
            let r = response.json();
            return r;
        }
        else {
            return null;
        }
    }).then(data => {
        if (data !== null) {
            let modelElm = document.getElementById('f2aModal');
            let modal = bootstrap.Modal.getInstance(modelElm);
            input.classList.remove('is-invalid');
            input.value = '';
            modal.hide();

            sessionStorage.setItem('jwt', data.access);
            sessionStorage.setItem('refresh', data.refresh);
            if (keepLoggedIn)
                localStorage.setItem('refresh', data.refresh);
            loggedIn = true;
            window.localStorage.setItem('loggedIn', loggedIn);
            document.getElementById('loginLoading').classList.toggle('d-none');

            postLogin();
        }
        else {
            let input = document.getElementById('login2FA');
            input.classList.add('is-invalid');
        }
    }).catch(error => {
        let modal = new bootstrap.Modal(document.getElementById('loginFailModal'));
        modal.show();
    });
}

//Logout the user
async function logout() {
    stopSessionCheck();

    const url = '/api/auth/logout/';
    await fetch(url, {
        method: 'POST',
        body: JSON.stringify({
            refresh: sessionStorage.getItem('refresh')
        }),
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            Authorization: `Bearer ${sessionStorage.getItem('jwt')}`
        }
    }).then(response => {
        if (response.status === 200) {
            return response.json();
        }
        else {
            return null;
        }
    }).then(data => {
        if (data !== null) {
            return;
        }
        else {
            return;
        }
    }).catch(error => {
        let modal = new bootstrap.Modal(document.getElementById('loginFailModal'));
        modal.show();
        document.getElementById('loginLoading').classList.toggle('d-none');
    });
    clearSession();
}

//Clear the session
function clearSession() {
    stopSessionCheck();

    sessionStorage.removeItem('jwt');
    sessionStorage.removeItem('refresh');
    localStorage.removeItem('refresh');
    loggedIn = false;
    window.localStorage.setItem('loggedIn', loggedIn);
    _user = null;
    document.getElementById('header').style.display = 'none';
    document.getElementById('notification-area').innerHTML = '';
    changeContent('login', false);
}

//Create a new user account
function signup(event) {
    event.preventDefault();
    let username = document.getElementById('signupUsername');
    let email = document.getElementById('signupEmail');
    let password = document.getElementById('signupPassword');
    let confirmPassword = document.getElementById('signupConfirmPassword');

    document.getElementById('signupUsername').classList.remove('is-invalid');
    if (username.value === '' || email.value === '' || password.value === '' || confirmPassword.value === '')
        return;
    if (password.value !== confirmPassword.value) {
        document.getElementById('signupConfirmPassword').classList.add('is-invalid');
        document.getElementById('passwordMatchFeedback').innerText = i18next.t('settings.passwordsDoNotMatch');
        translateAll();
        return;
    }
    else
        document.getElementById('signupConfirmPassword').classList.remove('is-invalid');
    const url = '/api/auth/signup/';
    fetch(url, {
        method: 'POST',
        body: JSON.stringify({
            username: username.value,
            email: email.value,
            password: password.value,
            confirm_password: confirmPassword.value
        }),
        headers: {
            'Content-Type': 'application/json; charset=utf-8'
        }
    }).then(response => {
        document.getElementById('signupEmail').classList.remove('is-invalid');
        document.getElementById('signupUsername').classList.remove('is-invalid');
        document.getElementById('signupConfirmPassword').classList.remove('is-invalid');
        if (response.status === 400) {
            response.json().then(data => {
                if (data?.email !== undefined) {
                    document.getElementById('signupEmail').classList.add('is-invalid');
                }
                if (data?.username !== undefined) {
                    document.getElementById('signupUsername').classList.add('is-invalid');
                }
                if (data.non_field_errors?.some(element => element.includes('This password'))) {
                    document.getElementById('signupConfirmPassword').classList.add('is-invalid');
                    document.getElementById('passwordMatchFeedback').innerText = i18next.t('login.passwordSimple');
                }
                translateAll();
            });
            return;
        }
        else if (response.status === 201 || response.status === 200) {
            return response.json();
        }
        else {
            throw new Error('Error creating account');
        }
    }).then(data => {
        if (data !== undefined) {
            showOTPModal();
        }
    }).catch(error => {
        let modal = new bootstrap.Modal(document.getElementById('signupFailModal'));
        modal.show();
        translateAll();
    });
}

function showOTPModal() {
    let modal = new bootstrap.Modal(document.getElementById('signupSuccessModal'));
    modal.show();
    document.getElementById('signupOTP').focus();
}

//Confirm the OTP
async function confirmSignup() {
    let input = document.getElementById('signupOTP');
    let otp = input?.value;
    if (otp === '' || otp == undefined) {
        input.classList.add('is-invalid');
        return;
    }
    input.classList.remove('is-invalid');
    const url = '/api/auth/check_otp/';
    await fetch(url, {
        method: 'POST',
        body: JSON.stringify({
            otp: otp,
            purpose: 'signup'
        }),
        headers: {
            'Content-Type': 'application/json; charset=utf-8'
        }
    }).then(response => {
        if (response.status === 201) {
            let r = response.json();
            return r;
        }
        else {
            return null;
        }
    }).then(data => {
        if (data !== null) {
            let modelElm = document.getElementById('signupSuccessModal');
            let modal = bootstrap.Modal.getInstance(modelElm);
            input.classList.remove('is-invalid');
            input.value = '';
            modal.hide();
            const appendAlert = (message, type) => {
                const wrapper = document.createElement('div')
                wrapper.innerHTML = [
                    `<div class="alert alert-${type} alert-dismissible" role="alert">`,
                    `   <div>${message}</div>`,
                    '   <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>',
                    '</div>'
                ].join('')
                const alertPlaceholder = document.getElementById('signupSuccessAlert');
                alertPlaceholder.append(wrapper)
            }
            appendAlert(i18next.t('login.accountCreated'), 'success');
        }
        else {
            let input = document.getElementById('signupOTP');
            input.classList.add('is-invalid');
        }
    }).catch(error => {
        let modal = new bootstrap.Modal(document.getElementById('signupFailModal'));
        modal.show();
    });
}

//Get user data
async function getUserData() {
    const userID = await getUserID();
    if (userID === null)
        return;
    const url = `/api/users/${userID}/`;
    const response = await fetch(url, {
        method: 'GET',
        headers: {
            Accept: 'application/json',
            "Content-Type": "application/json",
            Authorization: `Bearer ${sessionStorage.getItem('jwt')}`
        }
    });
    if (response.status === 401) {
        let data = await refreshLogin();
        return data;
    }
    if (response.status !== 200) {
        logout();
        return;
    };
    const data = await response.json();
    return data;
}

//Get the user ID from the access token
async function getUserID() {
    try {
        if (sessionStorage.getItem('jwt') === null)
            await refreshLogin();
        const payload = sessionStorage.getItem('jwt').split('.')[1];
        return JSON.parse(atob(payload))?.user_id;
    }
    catch (e) {
        return null;
    }
}

//Refresh the login token
async function refreshLogin() {
    if (sessionStorage.getItem('refresh') !== null) {
        const refreshToken = sessionStorage.getItem('refresh');
        const url = '/api/auth/token/refresh/';
        const response = await fetch(url, {
            method: 'POST',
            body: JSON.stringify({
                refresh: refreshToken
            }),
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
            }
        }).then(response => {
            if (response.status === 200) {
                return response.json();
            }
            else {
                return null;
            }
        }).then(data => {
            if (data !== null) {
                sessionStorage.setItem('jwt', data.access);
                sessionStorage.setItem('refresh', data.refresh);
                if (localStorage.getItem('keepLoggedIn') === 'true')
                    localStorage.setItem('refresh', data.refresh);
                return getUserData();
            }
            else {
                clearSession();
                return;
            }
        });
        return response;
    }
    return null;
}

//Verify the refresh token
async function verifyRefreshToken(refresh) {
    const url = '/api/auth/token/refresh/';
    await fetch(url, {
        method: 'POST',
        body: JSON.stringify({
            refresh: refresh
        }),
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
        }
    }).then(response => {
        return response.status === 200;
    }).catch(error => {
        return false;
    });
}

//Add a friend
async function addFriendAsync(friendName) {
    const userID = await getUserID();
    if (userID === null)
        return;
    const url = `/api/users/${userID}/invite_friend/`;
    const response = await fetch(url, {
        method: 'PUT',
        body: JSON.stringify({
            add_friend: friendName
        }),
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            Authorization: `Bearer ${sessionStorage.getItem('jwt')}`
        }
    });
    if (response.status === 401) {
        await refreshLogin();
        return await addFriendAsync(friendName);
    }
    return response;
}

//Get a user by ID
async function getUserByID(userID) {
    const url = `/api/users/${userID}/`;
    const response = await fetch(url, {
        method: 'GET',
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json; charset=utf-8',
            Authorization: `Bearer ${sessionStorage.getItem('jwt')}`
        }
    });
    if (response.status === 401) {
        await refreshLogin();
        return await getUserByID(userID);
    }
    const data = await response.json();
    return data;
}

//Accept a friend request
async function acceptFriendRequestAsync(friendID) {
    const userID = await getUserID();
    if (userID === null)
        return;
    const url = `/api/users/${userID}/accept_friend/`;
    const response = await fetch(url, {
        method: 'PUT',
        body: JSON.stringify({
            accept_friend: friendID
        }),
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            Authorization: `Bearer ${sessionStorage.getItem('jwt')}`
        }
    });
    if (response.status === 401) {
        await refreshLogin();
        return await acceptFriendRequestAsync(friendID);
    }
    return response;
}

//Remove a friend
async function removeFriendAsync(friendName) {
    const userID = await getUserID();
    if (userID === null)
        return;
    const url = `/api/users/${userID}/remove_friend/`;
    const response = await fetch(url, {
        method: 'PUT',
        body: JSON.stringify({
            remove_friend: friendName
        }),
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            Authorization: `Bearer ${sessionStorage.getItem('jwt')}`
        }
    });
    if (response.status === 401) {
        await refreshLogin();
        return await removeFriendAsync(friendName);
    }
    return response;
}

//Reject a friend request
async function rejectFriendRequestAsync(friendName) {
    const userID = await getUserID();
    if (userID === null)
        return;
    const url = `/api/users/${userID}/remove_friend_request/`;
    const response = await fetch(url, {
        method: 'PUT',
        body: JSON.stringify({
            remove_friend: friendName
        }),
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            Authorization: `Bearer ${sessionStorage.getItem('jwt')}`
        }
    });
    if (response.status === 401) {
        await refreshLogin();
        return await rejectFriendRequestAsync(friendName);
    }
    return response;
}

//Block a user
async function blockUserAsync(userName) {
    const userID = await getUserID();
    if (userID === null)
        return;
    const url = `/api/users/${userID}/block/`;
    const response = await fetch(url, {
        method: 'PUT',
        body: JSON.stringify({
            user: userName
        }),
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            Authorization: `Bearer ${sessionStorage.getItem('jwt')}`
        }
    });
    if (response.status === 401) {
        await refreshLogin();
        return await blockUserAsync(userName);
    }
    return response;
}

//Get the user avatar
async function getUserAvatar(userID) {
    let url = `/api/users/${userID}/get_avatar/`;
    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${sessionStorage.getItem('jwt')}`
            }
        });
        if (response.ok) {
            const blob = await response.blob();
            const objectURL = URL.createObjectURL(blob);
            return objectURL;
        } else {
            return null;
        }
    } catch (error) {
        return null;
    }
}