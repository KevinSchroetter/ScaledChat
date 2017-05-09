/*
 * Replacing some critical characters
 */
function pbksValidate(string){
	string = string.replace(/&lt;/g, " ");
	string = string.replace(/</g, " ");
	string = string.replace(/&gt;/g, " ");
	string = string.replace(/>/g, " ");
	string = string.replace(/&amp;/g, "&");
	string = string.replace(/&quot;/g, "");
	return string;
}
function regExCheckText(input){
		var pattern = new RegExp(/[~`!#$%\^&% *+=\\[\]\\';,/{}|\\":<>\?]/); //unerlaubte Zeichen
		if (pattern.test(input)) {
			return false;
		}
		else{
		return true;
		}
	}
	function regExCheckPW(input){
		var pattern = new RegExp(/[~`$%\^% =\\[\]\\';,/{}|\\":<>\?]/); //unerlaubte Zeichen
		if (pattern.test(input)) {
			return false;
		}
		else{
		return true;
		}
	}
