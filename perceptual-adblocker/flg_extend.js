
const WHY_THIS_AD = {
    "Why This Ad": ["google", "verizon"], // https://www.verizonmedia.com/policies/us/en/verizonmedia/privacy/adinfo/index.html
    "I like this ad": ["verizon"], // https://www.verizonmedia.com/policies/us/en/verizonmedia/privacy/adinfo/index.html
    "I don't like this ad": ["verizon"], // https://www.verizonmedia.com/policies/us/en/verizonmedia/privacy/adinfo/index.html
    "Close ad": ["verizon"], // https://www.verizonmedia.com/policies/us/en/verizonmedia/privacy/adinfo/index.html
    "About the Advertiser": ["google"],
}

function randomString(length) {
    return Math.round((Math.pow(36, length + 1) - Math.random() * Math.pow(36, length))).toString(36).slice(1);
}

function runWhyThisAdSearch(container) {
    let TEXTNODE_TYPE = 3;
    let ELEMENTNODE_TYPE = 1;
    let container_element = container[0];
    if (container_element.classList.contains("AdHighlighterObservedWhyThisAd")) {
        return;
    }
    let child_nodes_list = [container_element];
    let found_match = false;

    while (child_nodes_list.length > 0) {
        let elem = child_nodes_list.shift();

        // we don't care about text from scripts
        if (elem.tagName === "SCRIPT" || elem.tagName === "IFRAME" || elem.tagName === "STYLE") {
            //console.log("ignore script/iframes tags");
            continue;
        }

        if (elem.nodeType !== ELEMENTNODE_TYPE && elem.nodeType !== TEXTNODE_TYPE) {
            //console.log("ignoring type: " + elem.nodeType);
            continue;
        }
        if (elem.nodeType === TEXTNODE_TYPE && elem.textContent != null) {
            if (elem.textContent.trim().length > 0) {
                let text = elem.textContent.trim().toLowerCase();
                //console.log("found text : " + text);
                for (let key in WHY_THIS_AD) {
                    //console.log("key " + key + ", value " + WHY_THIS_AD[key]);
                    if (text.indexOf(key.toLowerCase()) >= 0) {
                        found_match = true;
                        break;
                    }
                }
            }
            if (found_match) {
                break;
            }
        }
        if (!found_match) {
            for (const child of elem.childNodes) {
                child_nodes_list.push(child);
            }
        }
    }

    if (found_match) {
        try {
            container_element.classList.add("AdHighlighterObservedWhyThisAd");
            console.log("covering for element with Why This Ad");
            coverContainer($(container_element), "Why This Ad - AD IDENTIFIED", "", false, true, false, null, null);
        } catch(error) {
            console.warn("Could not cover ad from the top");
        }
    }
}
