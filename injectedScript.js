(function anderInputAutofill() {
    const log = (function findNativeLogger() {
        if (window.NativeJavascriptInterface) {
            return function androidLogger(msg) {
                // Call Android interface
                try {
                    window.NativeJavascriptInterface.postMessage(msg);
                } catch (e) {
                    console.error(e);
                }
            }
        } else if (window.webkit && window.webkit.messageHandlers) {
            return function iosLogger(msg) {
                // Call iOS interface
                try {
                    webkit.messageHandlers.NativeJavascriptInterface.postMessage(msg);
                } catch (e) {
                    console.error(e);
                }
            }
        } else {
            // No Android or iOS interface found
            console.warn("No native APIs found.");
            return console.log;
        }
    })()

    const runOnlyOnceGuard = 'anderInputAutofillExecuted';

    if (runOnlyOnceGuard in window) {
        log('anderInputAutoFill script has been already executed');
        return;
    }

    window[runOnlyOnceGuard] = true;

    const token = "TOKEN_PLACEHOLDER";
    const apiBaseURL = "DOMAIN_PLACEHOLDER";
    const partnerPublicId = 'PARTNER_PLACEHOLDER';

    const debug = true;

    let DATA = {
        firstName: "",
        lastName: "",
        email: "",
        externalId: "",
        roleText: '',
        dealerCodes: [],
        dealershipNames: [],
    };

    function setNativeValue(element, value) {
        if (!element) return;

        const setter = Object.getOwnPropertyDescriptor(
            Object.getPrototypeOf(element),
            "value",
        )?.set;

        if (setter) {
            setter.call(element, value);
        } else {
            element.value = value;
        }

        if (!value) return;

        element.dispatchEvent(new Event("input", {bubbles: true}));
        element.dispatchEvent(new Event("change", {bubbles: true}));
    }

    function findInputs(root = document) {
        const first = root.querySelector("input#question_first_name");
        const last = root.querySelector("input#question_last_name");
        const email = root.querySelector("input#question_email");
        const hma = root.querySelector("input#question_HMA\\/DLRID");
        const dealerCode = root.querySelector("input#question_DealerCode");
        const dealershipName = root.querySelector("input#question_DealershipName");
        return {first, last, email, hma, dealerCode, dealershipName};
    }

    function findJobRoleRadioButton(roleText) {
        let radio;

        window['question_JobRole']?.querySelectorAll('.zoom-radio__wrap').forEach(el => {
            if (radio) return;

            if (el.innerText === roleText) {
                radio = el;
            }
        })

        return radio;
    }

    function fill(root = document) {
        const {first, last, email, hma, dealerCode, dealershipName} = findInputs(root);
        const jobRoleButton = findJobRoleRadioButton(DATA.roleText);

        const noInputsFound = [first, last, email, hma, jobRoleButton, dealerCode, dealershipName].every(el => !el);
        if (noInputsFound) {
            return false;
        }

        if (first && !first.value) setNativeValue(first, DATA.firstName);
        if (last && !last.value) setNativeValue(last, DATA.lastName);
        if (email && !email.value) setNativeValue(email, DATA.email);
        if (hma && !hma.value) setNativeValue(hma, DATA.externalId);
        if (dealerCode && !dealerCode.value) setNativeValue(dealerCode, DATA.dealerCodes.join(', '));
        if (dealershipName && !dealershipName.value) setNativeValue(dealershipName, DATA.dealershipNames.join(', '));
        jobRoleButton?.click();

        return true;
    }

    function debounce(fn, ms) {
        let timer;
        return (...args) => {
            clearTimeout(timer);
            timer = setTimeout(() => fn(...args), ms);
        };
    }

    function start(root = document) {
        let filled = false;
        let observer;
        let interval

        const debouncedTryFill = debounce(tryFill, 150);
        tryFill();

        observer = new MutationObserver(debouncedTryFill);
        observer.observe(root, {childList: true, subtree: true});

        interval = setInterval(tryFill, 500);
        setTimeout(cleanup, 15000);

        function tryFill() {
            if (filled) return;
            if (fill(root)) {
                filled = true;
                cleanup();
            }
        }

        function cleanup() {
            observer?.disconnect();
            clearInterval(interval);
        }
    }

    function init() {
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", init);
        } else {
            start(document);
        }
    }

    function findPrimaryJobCodes(sessionMe) {
        const hyundaiPartner = sessionMe.partners?.find(p => p.publicId === 'hyundai');
        if (!hyundaiPartner) return [];

        const def = hyundaiPartner.variableDefinitions?.find(d => d.name === 'Hyundai.PrimaryJobCodes');
        if (!def) return [];

        const variable = sessionMe.variables?.find(v => String(v.definitionId) === String(def.id));
        if (!variable) return [];

        return Array.isArray(variable.value) ? variable.value.map(String) : [];
    }

    function extractDealerCode(externalId) {
        if (typeof externalId !== 'string') return null;
        const match = externalId.match(/^Hyundai-(.+?)(?:-Sales)?$/);
        return match ? match[1] : null;
    }

    async function fetchData() {
        const fetchJson = (url) =>
            fetch(url, {headers: {Authorization: `Bearer ${token}`}}).then(r => r.json());

        const [sessionMeResult, profileResult] = await Promise.allSettled([
            fetchJson(`${apiBaseURL}api/session/me?includePartnerData=true`),
            fetchJson(`${apiBaseURL}api/session/member/profile?partnerPublicId=${partnerPublicId}`),
        ]);

        let firstName = "", lastName = "", email = "", externalId = "", roleText = '';
        let dealerCodes = [], dealershipNames = [];

        if (sessionMeResult.status === 'fulfilled') {
            debug && log('session/me ' + JSON.stringify(sessionMeResult.value));

            const me = sessionMeResult.value;
            const fullName = me.displayName || "";
            const {1: fn = "", 2: ln = ""} = fullName.trim().match(/^(\S+)\s+(.+)$/) || [];
            firstName = fn;
            lastName = ln;
            email = me.email || "";
            externalId = me.externalId || "";
            const primaryJobCodes = findPrimaryJobCodes(me);
            roleText = primaryJobCodes.includes('SM') ? 'Sales Manager' :
                primaryJobCodes.includes('SP') ? 'Sales Consultant' : 'Other';

            debug && log('primaryJobCodes: ' + JSON.stringify(primaryJobCodes));
        } else {
            log("session/me error: " + sessionMeResult.reason?.message);
        }

        if (profileResult.status === 'fulfilled') {
            debug && log('session/member/profile ' + JSON.stringify(profileResult.value));

            const profile = profileResult.value;
            if (!email) email = profile.email || "";
            const sortedGroups = profile.groups?.toSorted((a, b) =>
                (a.name || '').localeCompare(b.name || '')
            ) ?? [];
            const tuples = sortedGroups.filter(g => !!g.name).map(g =>
                [g.name, extractDealerCode(g.externalId) ?? '']
            );
            dealershipNames = tuples.map(([name]) => name);
            dealerCodes = tuples.map(([, code]) => code);

            debug && log('dealerships ([name, code]): ' + JSON.stringify(tuples));
        } else {
            log("session/member/profile error: " + profileResult.reason?.message);
        }
        DATA = {firstName, lastName, email, externalId, roleText, dealerCodes, dealershipNames};

        debug && log('DATA: ' + JSON.stringify(DATA));
        init();
    }

    fetchData();
})()