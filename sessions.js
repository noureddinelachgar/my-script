"use strict";

/*
 * session.js: Payment Session integration support.
 *
 * Copyright (c) 2025 EquitiPay. All rights reserved.
 */

if (typeof EqPaymentSession === "undefined") {

    (function () {

        let iframeData = {};
        let __sessionId = null;
        let __webViewUrl = null;
        let __threeDsIframe = null;
        let __threeDsResult = null;
        let inputListToHide = {};

        const _baseUrl = "https://cips-card-embedded-fields-588235121174.us-central1.run.app";
        const _pblBaseUrl = "https://pbl-equiti-dev.equiti-pay.com";
        const INITIATE_PAYMENT_PATH = "/api/initiate-payment";
        const FINALIZE_PAYMENT_PATH = "/api/finalize-payment-v2";

        // --- Helpers ---
        const base64UrlEncode = (str) => btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');



        // Fetch and inject iframe data
        const injectProcessData = async () => {
            try {
                const response = await fetch(`${_baseUrl}/v1/api/s/i`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        sessionId: __sessionId,
                    }),
                });

                const data = await response.json();

                if (data) {
                    iframeData = data;
                } else {
                    throw new Error(data.message);
                }
            } catch (error) {
                throw error;
            }
        };

        // Load and configure iframes
        const loadIframes = () => {
            let iframeCounter = 0;
            const keys = Object.keys(inputListToHide);

            keys.forEach((element) => {
                const iframe = createIframe(element);
                document.getElementById(inputListToHide[element]).before(iframe);

                iframe.onload = () => {
                    iframeCounter++;
                    onIframeLoad(element, iframe, iframeCounter, keys.length);
                    toggleInputVisibility(element, iframe);
                };
            });
        };

        // Create iframe and set properties
        const createIframe = (element) => {
            const iframe = document.createElement("iframe");
            iframe.src = iframeData[element];
            iframe.id = `i${element}`;
            iframe.frameBorder = "0";
            iframe.allowTransparency = "true";
            iframe.readOnly = "readonly";
            iframe.scrolling = "no";
            iframe.role = "presentation";
            iframe.allow = "payment *";
            iframe.style.display = "none";
            return iframe;
        };

        // Handle iframe load
        const onIframeLoad = (element, iframe, iframeCounter, totalIframes) => {
            const cssConfig = getInputStyles(inputListToHide[element]);

            Object.entries(cssConfig).forEach(([property, value]) => {
                iframe.style[property] = value;
            });


            if (iframeCounter === totalIframes) {
                connectIframes();
            }
        };

        // Toggle visibility of input fields
        const toggleInputVisibility = (element, iframe) => {
            const inputElement = document.getElementById(inputListToHide[element]);
            inputElement.hidden = true;
            inputElement.style.display = "none";
            iframe.style.display = "block";
        };

        // Post message to all iframes
        const postMessageToIframes = (message, origin) => {
            const keys = Object.keys(inputListToHide);
            keys.forEach((element) => {
                document
                    .getElementById(`i${element}`)
                    .contentWindow.postMessage(message, origin);
            });
        };

        const connectIframes = () => {
            const cssConfig = generateCssConfig();
            console.log(cssConfig);

            let iframeCounter = 0;
            let cssLoadedCounter = 0;

            // Create an event handler function to reuse for adding/removing listeners
            const messageListener = (event) => {

                if (event.data.action === "loaded") {
                    iframeCounter++;
                    if (iframeCounter === Object.keys(inputListToHide).length) {
                        postMessageToIframes({ action: "cssConfig", cssConfig }, _baseUrl);
                    }
                }
                if (event.data.action === "loaded-css") {

                    cssLoadedCounter++;
                    if (cssLoadedCounter === Object.keys(inputListToHide).length) {
                        sendEndConfiguration();
                        removeMessageListener();
                    }
                }
            };

            window.addEventListener("message", messageListener);

            const removeMessageListener = () => {
                window.removeEventListener("message", messageListener);
            };
        };

        // Send final configuration success message
        const sendEndConfiguration = () => {
            logAndSendMessage("configChanel", {
                status: "success",
                message: "Session configured successfully.",
            });
        };

        // Log and send messages
        const logAndSendMessage = (messageType, message) => {
            if (EqPaymentSession.messageChannel) {
                const { messageChannel } = EqPaymentSession;
                if (messageChannel[messageType]) {
                    messageChannel[messageType](message);
                }
            } else {
                alert("messageChannel not set");
            }
        };

        // Generate CSS config for iframes
        const generateCssConfig = () => ({
            cardNumber: getFontCssVariables(inputListToHide.cardNumber),
            cvv: getFontCssVariables(inputListToHide.cvv),
            nameOnCard: getFontCssVariables(inputListToHide.nameOnCard),
            expiryDate: getFontCssVariables(inputListToHide.expiryDate),
        });

        // Get font CSS variables for an element
        const getFontCssVariables = (elementId) => {

            if (!elementId) {
                return {};
            }

            const inputRelatedProperties = [
                "font-size",
                "font-family",
                "line-height",
                "text-align",
                "text-transform",
                "letter-spacing",
                "font-weight",
                "font-style",
                "height",
                "border",
            ];

            const element = document.getElementById(elementId);
            if (!element) {
                console.error(`Element with id "${elementId}" not found.`);
                return {};
            }

            const styles = getComputedStyle(element);
            const variables = {};

            for (let i = 0; i < styles.length; i++) {
                const property = styles[i];
                if (inputRelatedProperties.includes(property)) {
                    variables[property] = styles.getPropertyValue(property).trim();
                }
            }

            variables["outline"] = "0";
            return Object.fromEntries(Object.entries(variables).reverse());
        };

        // Get input styles for an element
        const getInputStyles = (elementId) => {
            const element = document.getElementById(elementId);
            if (!element) {
                console.error(`Element with id "${elementId}" not found.`);
                return {};
            }

            const styles = getComputedStyle(element);
            const inputStyles = {};

            for (let i = 0; i < styles.length; i++) {
                const property = styles[i];
                const value = styles.getPropertyValue(property).trim();
                if (value && value !== "initial") {
                    inputStyles[property] = value;
                }
            }

            return inputStyles;
        };

        const triggerBackendPayment = async () => {
            try {
                const response = await fetch(`${_pblBaseUrl}${INITIATE_PAYMENT_PATH}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json; charset=utf-8' },
                    body: JSON.stringify({ id: __sessionId, native: "native" })
                });

                const jsonBody = response.ok ? await response.json() : null;
                if (!jsonBody) throw new Error("Payment initiation failed at server");

                const nextAction = jsonBody.next_actions?.[0] || null;

                if (nextAction === "complete" || !nextAction) {
                    logAndSendMessage("paymentChannel", {
                        status: "finished",
                        gateway_code: jsonBody.gateway_code || "FAILED",
                    });
                } else {
                    const encodedString = base64UrlEncode(JSON.stringify(jsonBody));
                    __webViewUrl = `${_pblBaseUrl}/master-v2/${__sessionId}?p=${encodedString}`;
                    logAndSendMessage("paymentChannel", { status: "await_3ds" });
                }
            } catch (e) {
                logAndSendMessage("paymentChannel", { status: "failed", message: e.message });
            }
        }

        // Payment Session configuration
        const EqPaymentSession = {
            messageChannel: null,
            configure: (card, sessionIdParam) => {

                Object.keys(inputListToHide).forEach(key => {
                    const existing = document.getElementById(`i${key}`);
                    if (existing) existing.remove();
                });

                // check if card is valid and all fields are present or only  the cvv is not present
                if (
                    !card ||
                    (!card.cardNumber && !card.nameOnCard && !card.expiryDate && (card.cvv === undefined || card.cvv === '')) ||
                    (!card.cardNumber && !card.nameOnCard && !card.expiryDate && card.cvv === null)
                ) {
                    return logAndSendMessage("configChanel", {
                        status: "error",
                        message: "Card details are required.",
                    });
                }



                if (!sessionIdParam || typeof sessionIdParam !== "string") {
                    return logAndSendMessage("configChanel", {
                        status: "error",
                        message: "Session ID must be a non-empty string.",
                    });
                }

                __sessionId = sessionIdParam;

                inputListToHide = {
                    cardNumber: card.cardNumber,
                    cvv: card.cvv,
                    nameOnCard: card.nameOnCard,
                    expiryDate: card.expiryDate,
                };

                //remove empty fields
                Object.keys(inputListToHide).forEach((key) => {
                    if (inputListToHide[key] === null || inputListToHide[key] === undefined || inputListToHide[key] === "") {
                        delete inputListToHide[key];
                    }
                }
                );




                if (
                    Object.values(inputListToHide).some((id) => !document.getElementById(id))
                ) {
                    return logAndSendMessage("configChanel", {
                        status: "error",
                        message: "One or more card elements not found.",
                    });
                }


                //check if all input fields are Disabled , Disabled == required
                if (
                    Object.values(inputListToHide).some((id) => !document.getElementById(id).disabled)
                ) {
                    return logAndSendMessage("configChanel", {
                        status: "error",
                        message: "One or more card elements are not disabled.",
                    });
                }

                if (EqPaymentSession.messageChannel) {
                    injectProcessData()
                        .then(() => loadIframes())
                        .catch((error) => {
                            logAndSendMessage("configChanel", {
                                status: "error",
                                message: error.message,
                            });
                        });
                } else {
                    alert("messageChannel not set");
                }
            },
            addCssConfig: (cssClass) => {
                pushCssConfig(cssClass);
            },
            initiatePayment: () => {
                start({ action: "start" });
            },
            initThreeDs: (containerId) => {
                const container = document.getElementById(containerId);
                if (!container || !__webViewUrl) return;

                __threeDsIframe = document.createElement("iframe");
                __threeDsIframe.src = __webViewUrl;
                __threeDsIframe.style.width = "100%"; __threeDsIframe.style.height = "100%"; __threeDsIframe.style.border = "none";
                container.appendChild(__threeDsIframe);

                const tDsHandler = (event) => {
                    let data = event.data;
                    if (typeof data === "string") try { data = JSON.parse(data); } catch (e) { return; }

                    if (data?.next_actions?.[0] === "3ds_ready") {
                        logAndSendMessage("paymentChannel", { status: "3ds_ready" });
                    } else if (data?.cripto) {
                        __threeDsResult = data;
                        logAndSendMessage("paymentChannel", { status: "3ds_result_received" });
                        window.removeEventListener("message", tDsHandler);
                    }
                };
                window.addEventListener("message", tDsHandler);
            },
            finalizePayment: async () => {
                if (!__threeDsResult || !__threeDsResult.cripto) {
                    return logAndSendMessage("paymentChannel", {
                        status: "error",
                        message: "Missing 3DS result data."
                    });
                }

                try {
                    let criptoData;

                    // Wrap the decoding and parsing in a secondary check for safety
                    try {
                        const decodedString = atob(__threeDsResult.cripto);
                        criptoData = JSON.parse(decodedString);
                    } catch (parseError) {
                        console.error("Failed to decode or parse 3DS result:", parseError);
                        return logAndSendMessage("paymentChannel", {
                            status: "failed",
                            message: "Invalid data received from 3DS process."
                        });
                    }

                    // Proceed with the API call using the safely parsed data
                    const response = await fetch(`${_pblBaseUrl}${FINALIZE_PAYMENT_PATH}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            session_id: __sessionId,
                            gateway_recommendation: criptoData.gateway_recommendation,
                            three_ds_result: criptoData.three_ds_result
                        })
                    });

                    if (!response.ok) throw new Error(`Server responded with ${response.status}`);

                    const result = await response.json();
                    EqPaymentSession.cleanupThreeDs();

                    logAndSendMessage("paymentChannel", {
                        status: "finished",
                        gateway_code: result.gateway_code
                    });

                } catch (e) {
                    console.error("Finalize Payment Error:", e);
                    logAndSendMessage("paymentChannel", {
                        status: "finished",
                        gateway_code: "ERROR",
                        message: e.message
                    });
                }
            },

            cleanupThreeDs: () => {
                if (__threeDsIframe) { __threeDsIframe.remove(); __threeDsIframe = null; }
            }
        };

        const start = (message) => {
            let successCount = 0;
            let errorCount = 0;

            // Assuming postMessageToIframes is a function that sends the message to iframes
            postMessageToIframes(message, _baseUrl);

            // Initial processing message
            logAndSendMessage("updateChanel", {
                status: "processing",
                message: "Processing...",
            });

            // Create an event handler function for the message event
            const messageHandler = (event) => {
                if (event.origin !== _baseUrl) return;

                if (event.data.status === "success") {
                    successCount++;
                } else if (event.data.status === "error") {
                    errorCount++;
                    logAndSendMessage("updateChanel", { status: "error", ...event.data });
                }

                // Check if all messages have been processed based on inputListToHide
                if (successCount + errorCount === Object.keys(inputListToHide).length) {
                    // If there were errors, log an error message
                    if (errorCount > 0) {
                        logAndSendMessage("updateChanel", {
                            status: "error",
                            message: "Session Update Failed!",
                            code: 400,
                        });
                    } else {
                        // If no errors, log a success message
                        logAndSendMessage("updateChanel", {
                            status: "success",
                            message: "Session Updated!",
                            code: 200,
                        });

                        triggerBackendPayment();
                    }

                    // Remove the event listener after processing
                    window.removeEventListener("message", messageHandler);
                }
            };

            // Add the event listener to handle messages
            window.addEventListener("message", messageHandler);
        };
        const pushCssConfig = (cssClass) => {
            const cssConfig = {
                cardNumber: {},
                cvv: {},
                nameOnCard: {},
                expiryDate: {},
            };
            cssConfig.cardNumber = cssClass.cardNumber ? cssClass.cardNumber : {};
            cssConfig.cvv = cssClass.cvv ? cssClass.cvv : {};
            cssConfig.nameOnCard = cssClass.nameOnCard ? cssClass.nameOnCard : {};
            cssConfig.expiryDate = cssClass.expiryDate ? cssClass.expiryDate : {};
            postMessageToIframes({ action: "cssConfig", cssConfig }, _baseUrl);
        };

        window.EqPaymentSession = EqPaymentSession;

    })();
}
