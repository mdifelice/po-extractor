/**
 * JS Handler.
 *
 * @package Entravision_Tools
 */

document.addEventListener( 'DOMContentLoaded', function() {
	var walkEntries = function( masterEntry, callback, entries, masterEntryFullPath ) {
		if ( 'undefined' === typeof masterEntryFullPath ) {
			masterEntryFullPath = masterEntry.fullPath;
		}

		if ( 'undefined' === typeof entries ) {
			entries = [];

			if ( 'undefined' === typeof window.directoriesToRead ) {
				window.directoriesToRead = {};
			}

			window.directoriesToRead[ masterEntryFullPath ] = 0;
		}

		if ( '.' !== masterEntry.name.substr( 0, 1 ) ) {
			if ( masterEntry.isFile ) {
				entries.push( masterEntry );
			} else if ( masterEntry.isDirectory ) {
				var reader = masterEntry.createReader();

				directoriesToRead[ masterEntryFullPath ]++;

				reader.readEntries( function( readerEntries ) {
					if ( readerEntries.length ) {
						for ( var i = 0, readerEntriesLength = readerEntries.length; i < readerEntriesLength; i++ ) {
							var entry = readerEntries[ i ];

							if ( i === readerEntries.length - 1 ) {
								directoriesToRead[ masterEntryFullPath ]--;
							}

							walkEntries( entry, callback, entries, masterEntryFullPath );
						}
					} else {
						directoriesToRead[ masterEntryFullPath ]--;

						if ( ! directoriesToRead[ masterEntryFullPath ] ) {
							callback( entries );
						}
					}
				} );
			}
		}

		if ( ! directoriesToRead[ masterEntryFullPath ] ) {
			callback( entries );
		}
	};

	var loadEntries = function( items, callback ) {
		var entries = [];

		if ( items.length ) {
			var itemsLength    = items.length;
			var itemsProcessed = itemsLength;

			for ( var i = 0; i < itemsLength; i++ ) {
				var item = items[ i ];

				if ( 'file' === item.kind ) {
					var entry = item.webkitGetAsEntry();

					walkEntries( entry, function( entryEntries ) {
						itemsProcessed--;

						entries = entries.concat( entryEntries );

						if ( ! itemsProcessed ) {
							callback( entries );
						}
					} );
				} else {
					itemsProcessed--;

					if ( ! itemsProcessed ) {
						callback( entries );
					}
				}
			}
		} else {
			callback( entries );
		}
	};

	var loadFiles = function( entries, callback ) {
		var files        = {};
		var totalEntries = entries.length;

		if ( totalEntries ) {
			entries.forEach( function( entry ) {
				entry.file( function( file ) {
					var reader = new FileReader();

					reader.entryKey = this.fullPath;
					reader.onload   = function( a ) {
						totalEntries--;

						files[ this.entryKey ] = this.result;

						if ( ! totalEntries ) {
							callback( files );
						}
					};

					reader.readAsText( file );
				}.bind( entry ) );
			} );
		} else {
			callback( files );
		}
	};

	var translateText = function( language, text, callback ) {
		var client = new XMLHttpRequest();

		client.addEventListener( 'load', function() {
			var translation = '';
			var response    = JSON.parse( client.responseText );

			if ( response ) {
				translation = response[0][0][0];
			}

			callback( translation );
		} );

		client.open( 'GET', 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=' + encodeURIComponent( language ) + '&dt=t&q=' + encodeURIComponent( text ) );
		client.send();
	};

	var loadCurrentTranslations = function( files ) {
		var translations = {};

		var translationsRegularExpression = new RegExp( 'msgid\\s+"(.+)"\\nmsgstr\\s+"(.+)"', 'g' );
		var domainRegularExpression       = new RegExp( '^#\\s*domain:\\s*(.+),\\s*language:\\s*(.+)\\n', 'i' );

		for ( var path in files ) {
			var contents = files[ path ];
			var matches;

			matches = domainRegularExpression.exec( contents );

			if ( matches ) {
				var domain   = matches[1];
				var language = matches[2];

				if ( 'undefined' === typeof translations[ domain ] ) {
					translations[ domain ] = {};
				}

				if ( 'undefined' === typeof translations[ domain ][ language ] ) {
					translations[ domain ][ language ] = {};
				}

				while ( matches = translationsRegularExpression.exec( contents ) ) {
					var id          = matches[1];
					var translation = matches[2];

					translations[ domain ][ language ][ id ] = translation;
				}
			}
		}

		return translations;
	};

	var processFiles = function( files, translations, callback ) {
		var languages = [];
		var totalIds  = 0;
		var domains   = {};
		var functions = [
			'__',
			'_e',
			'esc_attr__',
			'esc_attr_e',
			'esc_html__',
			'esc_html_e'
		];

		var functionsRegularExpression = new RegExp( '\\s(?:' + functions.join( '|' ) + ')\\s*\\(\\s*[\'"]([^\'"]+)[\'"]\\s*,\\s*[\'"]([^\'"]+)[\'"]\\s*\\)', 'g' );

		languages.push( navigator.language );

		for ( var path in files ) {
			var contents = files[ path ];
			var matches;

			while ( matches = functionsRegularExpression.exec( contents ) ) {
				var id     = matches[1];
				var domain = matches[2];
				var line   = contents.substr( 0, matches.index ).match( /\n/g ).length + 1;

				if ( 'undefined' === typeof domains[ domain ] ) {
					domains[ domain ] = {};
				}

				if ( 'undefined' === typeof domains[ domain ][ id ] ) {
					domains[ domain ][ id ] = [];

					totalIds++;
				}

				domains[ domain ][ id ].push( {
					path: path,
					line: line
				} );
			}
		}

		var textsToTranslate = 0;
		var totalLanguages   = Object.keys( languages ).length;

		resetProgress( totalIds * totalLanguages );

		for ( var domain in domains ) {
			var ids = domains[ domain ];

			languages.forEach( function( language ) {
				for ( var id in ids ) {
					if ( 'undefined' === typeof translations[ domain ] ) {
						translations[ domain ] = {};
					}

					if ( 'undefined' === typeof translations[ domain ][ language ] ) {
						translations[ domain ][ language ] = {};
					}

					if ( 'undefined' === typeof translations[ domain ][ language ][ id ] ) {
						translations[ domain ][ language ][ id ] = '';

						var domainLanguageId = {
							domain   : domain,
							language : language,
							id       : id
						};

						textsToTranslate++;

						translateText( language, id, function( translation ) {
							translations[ this.domain ][ this.language ][ this.id ] = translation;

							textsToTranslate--;

							updateProgress();

							if ( ! textsToTranslate ) {
								prepareFiles( domains, languages, translations, callback );
							}
						}.bind( domainLanguageId ) );
					}
				}
			} );
		}

		if ( ! textsToTranslate ) {
			prepareFiles( domains, languages, translations, callback );
		};
	};

	var prepareFiles = function( domains, languages, translations, callback ) {
		var downloads    = [];
		var totalDomains = Object.keys( domains ).length;

		for ( var domain in domains ) {
			var contents = [];
			var ids      = domains[ domain ];

			languages.forEach( function( language ) {
				for ( var id in ids ) {
					var sources  = ids[ id ];
					var comments = [];

					for ( var l in sources ) {
						var source = sources[ l ];
						var path   = source.path;
						var line   = source.line;

						comments.push( path + ':' + line );
					}

					if ( contents.length ) {
						contents.push( '' );
					}

					var translation = translations[ domain ][ language ][ id ];

					contents.push( '# ' + comments.join( ', ' ) );
					contents.push( 'msgid "' + escapeMessage( id ) + '"' );
					contents.push( 'msgstr "' + escapeMessage( translation ) + '"' );
				}

				if ( contents.length ) {
					var baseName;

					if ( 1 === totalDomains ) {
						baseName = language;
					} else {
						baseName = domain + '-' + language;
					}

					contents.unshift( '# Domain: ' + domain + ', Language: ' + language );

					downloads.push( {
						name     : baseName + '.po',
						contents : contents.join( '\n' )
					} );
				}
			} );
		}

		if ( ! downloads.length ) {
			alert( 'No translation text has been found.' );

			callback();
		} else {
			downloadFiles( downloads, callback );
		}
	};

	var downloadFiles = function( files, callback ) {
		if ( ! files.length ) {
			callback();
		} else {
			var file    = files.pop();
			var element = document.createElement( 'A' );

			element.setAttribute( 'href', 'data:text/plain;charset=utf-8,' + encodeURIComponent( file.contents ) );
			element.setAttribute( 'download', file.name );

			element.style.display = 'none';

			document.body.appendChild( element );

			element.click();

			document.body.removeChild( element );

			setTimeout( function() {
				downloadFiles( files, callback );
			}, 100 );
		}
	};

	var resetProgress = function( total ) {
		if ( progressBar ) {
			progressBar.value = 0;
			progressBar.max   = total;
		}
	};

	var updateProgress = function() {
		if ( progressBar ) {
			var value = progressBar.value || 0;

			progressBar.value = value + 1;
		}
	};

	var escapeMessage = function( message ) {
		return message.replace( /"/g, '""' );
	};

	var dropper     = document.getElementById( 'dropper' );
	var progressBar = document.getElementById( 'progress-bar' );

	dropper.addEventListener( 'dragenter', function( e ) {
		dropper.classList.add( 'dragging' );
	} );

	dropper.addEventListener( 'dragleave', function( e ) {
		dropper.classList.remove( 'dragging' );
	} );

	/**
	 * This prevents the default drag & drop behaviour.
	 */
	dropper.addEventListener( 'dragover', function( e ) {
		e.preventDefault();
	} );

	dropper.addEventListener( 'drop', function( e ) {
		e.preventDefault();

		if ( ! dropper.classList.contains( 'processing' ) ) {
			dropper.classList.remove( 'dragging' );

			var items = e.dataTransfer.items;

			if ( items ) {
				dropper.classList.add( 'processing' );

				loadEntries( items, function( entries ) {
					var currentTranslationEntries = [];
					var translatableEntries       = [];

					entries.forEach( function( entry ) {
						var extension = entry.name.split( '.' ).pop();

						if ( 'undefined' === typeof extension ) {
							extension = '';
						} else {
							extension = extension.toLowerCase();
						}

						switch ( extension ) {
							case 'po':
								currentTranslationEntries.push( entry );
								break;
							case 'php':
								translatableEntries.push( entry );
								break;
						}
					} );

					loadFiles( currentTranslationEntries, function( files ) {
						var currentTranslations = loadCurrentTranslations( files );

						loadFiles( translatableEntries, function( files ) {
							processFiles( files, currentTranslations, function() {
								dropper.classList.remove( 'processing' );
							} );
						} );
					} );
				} );
			}
		}
	} );
} );
