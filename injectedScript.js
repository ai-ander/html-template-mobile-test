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
    const domain = "DOMAIN_PLACEHOLDER";

    let DATA = {
        firstName: "",
        lastName: "",
        email: "",
        externalId: "",
        roleText: '',
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
        return {first, last, email};
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
        const {first, last, email} = findInputs(root);
        const jobRoleButton = findJobRoleRadioButton(DATA.roleText);

        const noInputsFound = [first, last, email, jobRoleButton].every(el => !el);
        if (noInputsFound) {
            return false;
        }

        if (first && !first.value) setNativeValue(first, DATA.firstName);
        if (last && !last.value) setNativeValue(last, DATA.lastName);
        if (email && !email.value) setNativeValue(email, DATA.email);
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

        function tryFill() {
            if (filled) return;
            if (fill(root)) {
                filled = true;
                cleanup();
            }
        }

        function cleanup() {
            observer.disconnect();
            clearInterval(interval);
        }

        const debouncedTryFill = debounce(tryFill, 150);
        tryFill();

        const observer = new MutationObserver(debouncedTryFill);
        observer.observe(root, {childList: true, subtree: true});

        const interval = setInterval(tryFill, 500);
        setTimeout(cleanup, 15000);
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

    async function fetchData() {
        try {
            const resp = await fetch(`${domain}api/session/me`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });

            const data = await resp.json();
            const fullName = data.displayName || "";
            const {1: firstName = "", 2: lastName = ""} =
            fullName.trim().match(/^(\S+)\s+(.+)$/) || [];

            const email = data.email || "";
            const externalId = data.externalId || "";
            const primaryJobCodes = findPrimaryJobCodes(data);
            const roleText = primaryJobCodes.includes('SM') ? 'Sales Manager' :
                primaryJobCodes.includes('SC') ? 'Sales Consultant' : '';

            DATA = {firstName, lastName, email, externalId, roleText};

            init();
        } catch (e) {
            log("Fetch error: " + e.message);
        }
    }

    fetchData();
})()