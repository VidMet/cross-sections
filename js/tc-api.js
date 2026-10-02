let API = null;

export async function connectTC() {

    try {

        console.log(
            "Starter Trimble Connect API"
        );

        if (
            typeof TrimbleConnectWorkspace ===
            "undefined"
        ) {

            console.error(
                "TrimbleConnectWorkspace ikke funnet"
            );

            return null;
        }

        API =
            await TrimbleConnectWorkspace.connect(
                window.parent,
                function (event) {

                    console.log(
						"TC EVENT TYPE:",
						event.type
						);
						 
					console.log(
						"TC EVENT DATA:",
						event
						);

                }
            );

        console.log(
            "Trimble API:",
            API
        );

        return API;
    }
    catch (err) {

        console.error(
            "connectTC FEIL:",
            err
        );

        return null;
    }
}

export function getAPI() {

    return API;
}

export function setStatus(text) {

    const element =
        document.getElementById(
            "status"
        );

    if (element) {

        element.innerText =
            text;
    }
}