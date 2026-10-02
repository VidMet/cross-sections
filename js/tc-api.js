let API = null;

export async function connectTC() {

    try {

        console.log(
            "Starter Trimble Connect API..."
        );

        API =
            await TrimbleConnectWorkspace.connect(
                window.parent,
                (event) => {

                    console.log(
                        "TC EVENT:",
                        event
                    );

                }
            );

        console.log(
            "Trimble API koblet:",
            API
        );

        setStatus(
            "Trimble API koblet"
        );

        return API;
    }
    catch (err) {

        console.error(
            "TC FEIL:",
            err
        );

        setStatus(
            "TC API FEIL"
        );

        return null;
    }
}

export function getAPI() {

    return API;
}

export function setStatus(text) {

    document
        .getElementById("status")
        .innerText =
        text;
}
`