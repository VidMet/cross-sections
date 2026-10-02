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

					console.group(
					    "TC EVENT"
					);

					console.log(
					    "TYPE:",
					    event.type
					);

					console.dir(event);

					if (event.data) {

					    console.log(
					        "EVENT.DATA:"
					    );

					    console.dir(
					        event.data
					    );
					}

					console.groupEnd();

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